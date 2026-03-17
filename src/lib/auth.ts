import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

export interface SessionData {
  userId: string;
  email: string;
  name: string;
  role: string;
  clientId: string;
  clientName: string;
}

const SESSION_COOKIE_NAME = "mente_session";

export function getSessionOptions() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET env var must be set and at least 32 characters");
  }
  return {
    cookieName: SESSION_COOKIE_NAME,
    password: secret,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  };
}

/**
 * Get session from Next.js App Router (Server Components / Route Handlers).
 * Uses next/headers cookies().
 */
export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}

/**
 * Get session from a NextRequest (middleware-compatible).
 * Returns session data or null if not authenticated.
 */
export async function getSessionFromRequest(
  req: NextRequest,
  res: NextResponse
): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(req, res, getSessionOptions());
}

/**
 * Read session data from the current request headers
 * (set by middleware from the session cookie).
 */
export function getSessionUser(headers: Headers): SessionData | null {
  const userId = headers.get("x-user-id");
  if (!userId) return null;
  return {
    userId,
    email: headers.get("x-user-email") ?? "",
    name: headers.get("x-user-name") ?? "",
    role: headers.get("x-user-role") ?? "viewer",
    clientId: headers.get("x-user-client-id") ?? "",
    clientName: headers.get("x-user-client-name") ?? "",
  };
}
