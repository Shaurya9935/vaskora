import { router, protectedProcedure } from "../../trpc";
import { db } from "@repo/database";
import { githubInstallation } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { App } from "octokit";

export const githubRouter = router({
  getRepositories: protectedProcedure.query(async ({ ctx }) => {
    // 1. Check if the user has a GitHub installation linked
    const [installation] = await db.select()
      .from(githubInstallation)
      .where(eq(githubInstallation.userId, ctx.user.id))
      .limit(1);

    if (!installation) {
      return { isConnected: false, repos: [] };
    }

    // 2. Initialize Octokit
    const githubApp = new App({
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    });

    try {
      // 3. Authenticate as the specific user's installation
      const octokit = await githubApp.getInstallationOctokit(
        parseInt(installation.installationId)
      );

      // 4. Fetch the repos they gave us access to!
      const { data } = await octokit.rest.apps.listReposAccessibleToInstallation();
      
      return {
        isConnected: true,
        repos: data.repositories.map(repo => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          url: repo.html_url,
          private: repo.private,
        }))
      };
    } catch (error) {
      console.error("Failed to fetch repos:", error);
      throw new Error("Failed to communicate with GitHub API");
    }
  }),
});