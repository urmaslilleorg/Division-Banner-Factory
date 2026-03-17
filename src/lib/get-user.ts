import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";

export interface RequestUser {
  id: string;
  email: string;
  name: string;
  role: string;
  clientId: string;
  clientName: string;
}

/**
 * Read the authenticated user from request headers set by middleware.
 * Returns null if no session is present.
 *
 * Usage in Server Components / Route Handlers:
 *   import { headers } from "next/headers";
 *   const user = getUser(await headers());
 */
export function getUser(
  hdrs: ReadonlyHeaders | Headers
): RequestUser | null {
  const userId = hdrs.get("x-user-id");
  if (!userId) return null;
  return {
    id: userId,
    email: hdrs.get("x-user-email") ?? "",
    name: hdrs.get("x-user-name") ?? "",
    role: hdrs.get("x-user-role") ?? "viewer",
    clientId: hdrs.get("x-user-client-id") ?? "",
    clientName: hdrs.get("x-user-client-name") ?? "",
  };
}
