import { headers } from "next/headers";
import { getUser } from "@/lib/get-user";

/**
 * Get the current user's role from the session headers set by middleware.
 * Falls back to "viewer" if no session is present.
 */
export async function getUserRole(): Promise<string> {
  const hdrs = await headers();
  const user = getUser(hdrs);
  return user?.role ?? "viewer";
}

/**
 * Get the current user's ID from the session headers set by middleware.
 * Returns null if no session is present.
 */
export async function getUserId(): Promise<string | null> {
  const hdrs = await headers();
  const user = getUser(hdrs);
  return user?.id ?? null;
}
