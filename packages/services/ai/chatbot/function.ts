import { inngest } from "./client";
import { db } from "@repo/database";
import { featureRequest, featureClarificationMessage } from "@repo/database/schema";
import { eq } from "drizzle-orm";

// ─── OpenRouter AI Helper ────────────────────────────────────────────────────
async function askAI(
  messages: { role: string; content: string }[],
  jsonMode = false
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn("[askAI] OPENROUTER_API_KEY missing – using fallback.");
    return getFallbackResponse(messages, jsonMode);
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://shipflow.ai",
        "X-Title": "ShipFlow AI",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        response_format: jsonMode ? { type: "json_object" } : undefined,
        max_tokens: 3000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[askAI] OpenRouter error ${res.status}:`, err);
      return getFallbackResponse(messages, jsonMode);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty content from LLM");
    return content;
  } catch (err) {
    console.error("[askAI] Fetch failed:", err);
    return getFallbackResponse(messages, jsonMode);
  }
}

// ─── Context-aware fallback (used when API is unavailable) ───────────────────
function getFallbackResponse(
  messages: { role: string; content: string }[],
  jsonMode: boolean
): string {
  const combined = messages.map((m) => m.content).join("\n");

  if (!jsonMode) {
    return "Could you tell me more about who the target users are, and what specific pain point this solves for them?";
  }

  // ── PRD generation fallback ─────────────────────────────────────────────
  if (
    combined.includes("Principal Product Manager") ||
    combined.includes("PRD")
  ) {
    const titleMatch = combined.match(/Feature Title:\s*(.*)/i);
    const title =
      titleMatch && titleMatch[1] ? titleMatch[1].trim() : "Requested Feature";
    const promptMatch = combined.match(
      /Initial Description:\s*([\s\S]*?)(?:\n\nFull Conversation|$)/i
    );
    const prompt =
      promptMatch && promptMatch[1] ? promptMatch[1].trim() : "";

    return JSON.stringify({
      problemStatement: `Users working with "${title}" currently face significant friction due to the lack of an integrated solution. ${
        prompt ? `Specifically: "${prompt}". ` : ""
      }This results in reduced productivity, manual workarounds, and lost business value. A dedicated, well-designed implementation would directly address these gaps and improve user satisfaction and retention.`,
      goals: [
        `Deliver a reliable and scalable implementation of "${title}" that reduces manual effort by at least 80%.`,
        "Provide a seamless, intuitive user experience with minimal onboarding friction.",
        "Ensure the feature integrates cleanly with the existing workspace and permission model.",
        "Achieve 99.9% uptime and sub-200ms response times for all critical paths.",
      ],
      userStories: [
        `As a workspace admin, I want to configure and enable "${title}" from the settings panel so that my team can immediately start using it without engineering support.`,
        `As a regular user, I want to interact with "${title}" without needing to understand the technical implementation so that I can complete my tasks efficiently.`,
        `As a developer, I want clear tRPC endpoints so that I can integrate "${title}" into other workflows programmatically.`,
        `As an auditor, I want a complete activity log for all "${title}" actions so that I can meet compliance requirements.`,
      ],
      technicalRequirements: [
        `A tRPC mutation endpoint that validates input with Zod and performs the core "${title}" operation with proper auth guards.`,
        "Database schema additions using Drizzle ORM with appropriate foreign keys, indexes, and cascade rules.",
        "Row-level auth middleware ensuring only authorized workspace members can access the feature.",
        "Typed error codes returned to the client via tRPC error handling for all known failure modes.",
        "Unit and integration tests covering the critical happy path and primary failure scenarios.",
      ],
      outOfScope: [
        "Multi-tenant data isolation beyond workspace-level permissions (Phase 2).",
        "Native mobile app support — web-only for Phase 1.",
        "Automated analytics dashboards for usage metrics (Phase 2).",
      ],
    });
  }

  // ── Analysis fallback ───────────────────────────────────────────────────
  return JSON.stringify({
    needsMoreInfo: true,
    clarificationQuestion:
      "Great start! To help me generate a precise PRD, could you clarify: **Who are the primary users** of this feature (e.g., admins, end-users, developers), and **what is the single most important outcome** they should experience after it's implemented?",
  });
}

// ─── Inngest Function ────────────────────────────────────────────────────────
//
// ⚠️  IMPORTANT – Inngest Replay Model:
//     Inngest replays the ENTIRE function from the top on every resume event.
//     This means any local variables (loop counters, flags) are RESET on replay.
//     The ONLY reliable state between replays is the DATABASE.
//
//     Fix: Use sequential, named steps (turn-0, turn-1 …). Inngest deduplicates
//     by step name and skips already-completed steps when replaying, so the
//     logic below is safe across replays.
//
export const processFeatureRequest = inngest.createFunction(
  {
    id: "process-feature-request",
    triggers: [{ event: "feature.discovery.started" }],
  },
  async ({ event, step }) => {
    const { featureRequestId } = event.data as { featureRequestId: string };

    // ── Step 1: Load the feature request from the DB ───────────────────────
    const request = await step.run("fetch-request", async () => {
      const [result] = await db
        .select()
        .from(featureRequest)
        .where(eq(featureRequest.id, featureRequestId))
        .limit(1);
      if (!result)
        throw new Error(`Feature request ${featureRequestId} not found`);
      return result;
    });

    // ── Step 2: Ask the first clarification question (ALWAYS) ──────────────
    // We ALWAYS ask at least one question. This step is deduped on replay.
    await step.run("clarification-turn-0-ask", async () => {
      const systemMessage = {
        role: "system",
        content: `You are an expert Product Manager chatbot. Before drafting a PRD you need to ask ONE focused clarification question.

Choose the most important missing detail from:
- Who are the primary users / target audience?
- What is the core pain point or job-to-be-done?
- Are there key integrations or technical constraints?
- What does success look like (metrics / KPIs)?

Be conversational, friendly, and focused. Ask only 1-2 questions. Respond with a plain sentence — no JSON, no markdown headers.`,
      };

      const userMessage = {
        role: "user",
        content: `Feature Title: ${request.title}\nDescription: ${request.initialPrompt}`,
      };

      const question = await askAI([systemMessage, userMessage]);

      await db
        .update(featureRequest)
        .set({ status: "needs_clarification" })
        .where(eq(featureRequest.id, featureRequestId));

      await db.insert(featureClarificationMessage).values({
        featureRequestId,
        role: "ai",
        content: question,
      });
    });

    // ── Step 3: Pause until the user replies ──────────────────────────────
    await step.waitForEvent("wait-for-reply-turn-0", {
      event: "feature.discovery.user_replied",
      timeout: "7d",
      if: `async.data.featureRequestId == "${featureRequestId}"`,
    });

    // ── Step 4: Decide if a second clarification is needed ────────────────
    const needsSecondTurn = await step.run(
      "evaluate-after-turn-0",
      async () => {
        const chatMessages = await db
          .select()
          .from(featureClarificationMessage)
          .where(
            eq(featureClarificationMessage.featureRequestId, featureRequestId)
          )
          .orderBy(featureClarificationMessage.createdAt);

        const conversationHistory = chatMessages
          .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
          .join("\n");

        const systemMessage = {
          role: "system",
          content: `You are an expert Product Manager. Review the feature request and conversation so far.

Decide if you need ONE more targeted clarification before generating a great PRD. Only ask again if there is a genuinely critical gap — for example, no mention of target users, missing success criteria, or an unclear technical constraint that would change the architecture significantly.

If the conversation already has enough context for a comprehensive PRD, set "needsMoreInfo" to false.

Respond ONLY with this exact JSON (no markdown, no extra keys):
{"needsMoreInfo": boolean, "clarificationQuestion": string | null}`,
        };

        const userMessage = {
          role: "user",
          content: `Feature Title: ${request.title}\nDescription: ${request.initialPrompt}\n\nConversation:\n${conversationHistory}`,
        };

        const raw = await askAI([systemMessage, userMessage], true);
        try {
          const cleaned = raw
            .replace(/^```json\s*/i, "")
            .replace(/```\s*$/i, "")
            .trim();
          return JSON.parse(cleaned) as {
            needsMoreInfo: boolean;
            clarificationQuestion: string | null;
          };
        } catch {
          console.error("[evaluate-after-turn-0] Parse failed:", raw);
          return { needsMoreInfo: false, clarificationQuestion: null };
        }
      }
    );

    // ── Step 5 (Optional): Second clarification round ─────────────────────
    if (needsSecondTurn.needsMoreInfo && needsSecondTurn.clarificationQuestion) {
      await step.run("clarification-turn-1-ask", async () => {
        await db
          .update(featureRequest)
          .set({ status: "needs_clarification" })
          .where(eq(featureRequest.id, featureRequestId));

        await db.insert(featureClarificationMessage).values({
          featureRequestId,
          role: "ai",
          content: needsSecondTurn.clarificationQuestion as string,
        });
      });

      await step.waitForEvent("wait-for-reply-turn-1", {
        event: "feature.discovery.user_replied",
        timeout: "7d",
        if: `async.data.featureRequestId == "${featureRequestId}"`,
      });
    }

    // ── Step 6: Generate the final PRD ────────────────────────────────────
    await step.run("generate-prd", async () => {
      const chatMessages = await db
        .select()
        .from(featureClarificationMessage)
        .where(
          eq(featureClarificationMessage.featureRequestId, featureRequestId)
        )
        .orderBy(featureClarificationMessage.createdAt);

      const conversationHistory = chatMessages
        .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
        .join("\n");

      const systemMessage = {
        role: "system",
        content: `You are a Principal Product Manager at a top-tier technology company. Using the feature request and full conversation history, draft a comprehensive, professional Product Requirement Document (PRD).

The PRD must be highly specific to the actual request — do NOT use generic placeholders.

Respond ONLY with this JSON structure (no markdown code fences, no extra keys):
{
  "problemStatement": "2-3 paragraph professional description of the problem, context, user friction, business opportunity, and target audience.",
  "goals": [
    "3-5 specific, measurable business and product objectives as complete sentences."
  ],
  "userStories": [
    "4-6 user stories in format: As a [specific user type], I want [specific action] so that [measurable business value]."
  ],
  "technicalRequirements": [
    "4-6 specific technical requirements including API shapes, database changes, auth requirements, and performance targets."
  ],
  "outOfScope": [
    "2-3 explicit out-of-scope items to prevent scope creep."
  ]
}`,
      };

      const userMessage = {
        role: "user",
        content: `Feature Title: ${request.title}\nInitial Description: ${request.initialPrompt}\n\nFull Conversation:\n${conversationHistory}`,
      };

      const prdText = await askAI([systemMessage, userMessage], true);

      let prdContent: object;
      try {
        const cleaned = prdText
          .replace(/^```json\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();
        prdContent = JSON.parse(cleaned);
      } catch {
        console.error("[generate-prd] JSON parse failed:", prdText);
        prdContent = JSON.parse(getFallbackResponse([userMessage], true));
      }

      await db
        .update(featureRequest)
        .set({ status: "prd_generated", prdContent })
        .where(eq(featureRequest.id, featureRequestId));

      await db.insert(featureClarificationMessage).values({
        featureRequestId,
        role: "ai",
        content:
          "✨ Your PRD is ready! I've captured all the details from our conversation and generated a comprehensive Product Requirement Document. Review it in the panel on the right.",
      });
    });

    return { success: true };
  }
);
