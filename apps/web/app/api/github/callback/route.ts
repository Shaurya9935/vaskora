import { NextRequest, NextResponse } from "next/server";
import { db } from "@repo/database";
import { githubInstallation, user } from "@repo/database/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const installationId = searchParams.get("installation_id");
  const stateUserId = searchParams.get("state");

  if (!installationId) {
    return NextResponse.json({ error: "Missing installation_id parameter" }, { status: 400 });
  }

  try {
    let finalUserId = stateUserId;

    // If no user ID is provided in state, find the first user in the database or create a default dev user
    if (!finalUserId) {
      const [existingUser] = await db.select().from(user).limit(1);
      if (existingUser) {
        finalUserId = existingUser.id;
      } else {
        const [createdUser] = await db
          .insert(user)
          .values({
            id: "dev-user-id",
            name: "Developer",
            email: "dev@example.com",
            emailVerified: true,
          })
          .returning();
        
        if (!createdUser) {
          throw new Error("Failed to create default development user");
        }
        finalUserId = createdUser.id;
      }
    }

    // Check if the installation is already registered in our database
    const [existingInstallation] = await db
      .select()
      .from(githubInstallation)
      .where(eq(githubInstallation.installationId, installationId))
      .limit(1);

    if (existingInstallation) {
      // If it exists, update it to the active user
      await db
        .update(githubInstallation)
        .set({ userId: finalUserId, updatedAt: new Date() })
        .where(eq(githubInstallation.installationId, installationId));
    } else {
      // Otherwise insert it as a new installation linked to the active user
      await db.insert(githubInstallation).values({
        userId: finalUserId,
        installationId: installationId,
      });
    }

    // Redirect the user back to their dashboard
    return NextResponse.redirect(new URL(`/dashboard?github=connected`, req.url));
  } catch (error) {
    console.error("Failed to save GitHub installation:", error);
    return NextResponse.redirect(new URL(`/dashboard?error=github_failed`, req.url));
  }
}