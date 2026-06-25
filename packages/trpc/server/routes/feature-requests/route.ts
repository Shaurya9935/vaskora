import { router, protectedProcedure } from "../../trpc";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "../../../../database";
import { featureRequest, workspace, featureClarificationMessage } from "../../../../database/schema";
import { inngest } from "@repo/services/ai/chatbot/client";

export const featureRequestRouter = router({
  create: protectedProcedure
    .input(z.object({
      workspaceId: z.string().uuid().optional(),
      title: z.string(),
      prompt: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      let workspaceId = input.workspaceId;

      if (!workspaceId) {
        const [existingWorkspace] = await db.select().from(workspace).limit(1);

        if (existingWorkspace) {
          workspaceId = existingWorkspace.id;
        } else {
          const [createdWorkspace] = await db
            .insert(workspace)
            .values({
              name: "Default Workspace",
              slug: "default",
            })
            .returning();

          if (!createdWorkspace) {
            throw new Error("Failed to create default workspace.");
          }

          workspaceId = createdWorkspace.id;
        }
      }

      // 1. Save to Database
      const result = await db.insert(featureRequest).values({
        workspaceId,
        userId: ctx.user.id,
        title: input.title,
        initialPrompt: input.prompt,
        status: "pending",
      }).returning();

      const newRequest = result[0];
      if (!newRequest) {
        throw new Error("Failed to create feature request in database.");
      }

      // 2. Trigger the Inngest AI Workflow! 🚀
      await inngest.send({
        name: "feature.discovery.started",
        data: { featureRequestId: newRequest.id },
      });

      return newRequest;
    }),

  list: protectedProcedure
    .query(async ({ ctx }) => {
      return await db
        .select()
        .from(featureRequest)
        .orderBy(featureRequest.createdAt);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const [request] = await db
        .select()
        .from(featureRequest)
        .where(eq(featureRequest.id, input.id))
        .limit(1);
      return request || null;
    }),

  getMessages: protectedProcedure
    .input(z.object({ featureRequestId: z.string().uuid() }))
    .query(async ({ input }) => {
      return await db
        .select()
        .from(featureClarificationMessage)
        .where(eq(featureClarificationMessage.featureRequestId, input.featureRequestId))
        .orderBy(featureClarificationMessage.createdAt);
    }),

  sendReply: protectedProcedure
    .input(z.object({
      featureRequestId: z.string().uuid(),
      content: z.string(),
    }))
    .mutation(async ({ input }) => {
      // 1. Insert user message
      const [newMessage] = await db
        .insert(featureClarificationMessage)
        .values({
          featureRequestId: input.featureRequestId,
          role: "user",
          content: input.content,
        })
        .returning();

      // 2. Update status of featureRequest back to 'pending' to show AI is working/thinking
      await db
        .update(featureRequest)
        .set({ status: "pending" })
        .where(eq(featureRequest.id, input.featureRequestId));

      // 3. Send event to Inngest to wake up the workflow!
      await inngest.send({
        name: "feature.discovery.user_replied",
        data: { featureRequestId: input.featureRequestId },
      });

      return newMessage;
    }),
});
