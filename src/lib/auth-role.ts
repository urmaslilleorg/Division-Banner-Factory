/**
 * auth-role.ts
 *
 * Reads the user's role from Clerk publicMetadata via currentUser().
 *
 * WHY: Clerk does not include publicMetadata in the session JWT by default
 * (no JWT template configured). sessionClaims.metadata is therefore undefined,
 * causing all role checks to fall back to "viewer". This helper uses currentUser()
 * which always returns the full user object including publicMetadata.
 *
 * Usage (Server Components and Route Handlers only):
 *   import { getUserRole } from "@/lib/auth-role";
 *   const role = await getUserRole();
 */
import { currentUser } from "@clerk/nextjs/server";

export async function getUserRole(): Promise<string> {
  const user = await currentUser();
  if (!user) return "viewer";
  const role = user.publicMetadata?.role as string | undefined;
  return role ?? "viewer";
}
