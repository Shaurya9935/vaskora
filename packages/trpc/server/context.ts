import { auth } from "@repo/services/auth/src"; // Your Better Auth instance
import { db } from "../../database";
import { user } from "../../database/schema";

function toWebHeaders(headers: Headers | Record<string, string | string[] | undefined>) {
  if (headers instanceof Headers) {
    return headers;
  }

  const webHeaders = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      webHeaders.set(key, value);
    } else if (Array.isArray(value)) {
      webHeaders.set(key, value.join(", "));
    }
  }

  return webHeaders;
}

export async function createContext(opts: { req: { headers: Headers | Record<string, string | string[] | undefined> } }) {
  // 1. Grab the session securely using Better Auth!
  let session = await auth.api.getSession({
    headers: toWebHeaders(opts.req.headers),
  });

  // 2. Fallback user for development when session is not found
  if (!session) {
    try {
      // Find or create a developer user in the database
      let [defaultUser] = await db.select().from(user).limit(1);
      if (!defaultUser) {
        const result = await db.insert(user).values({
          id: "dev-user-id",
          name: "Developer",
          email: "dev@example.com",
          emailVerified: true,
        }).returning();
        defaultUser = result[0];
      }
      if (defaultUser) {
        session = {
          session: {
            id: "dev-session-id",
            userId: defaultUser.id,
            expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000), // Far future expiration
            token: "dev-token",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          user: defaultUser,
        };
      }
    } catch (err) {
      console.error("Failed to seed/fetch dev user for context fallback", err);
    }
  }

  // 3. Pass the session into the tRPC context
  return {
    req: opts.req,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
