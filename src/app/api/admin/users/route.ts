export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getUser } from "@/lib/get-user";
import {
  fetchAllUsers,
  fetchUsersByClientId,
  createUser,
} from "@/lib/users";
import { fetchClientById } from "@/lib/airtable-clients";

function requireAdmin(hdrs: Headers): NextResponse | null {
  const user = getUser(hdrs);
  if (!user || user.role !== "division_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * GET /api/admin/users?clientId=[id]
 * Returns users for a specific client, or all users if no clientId.
 * Requires division_admin role.
 */
export async function GET(request: NextRequest) {
  const hdrs = await headers();
  const authError = requireAdmin(hdrs);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  try {
    const users = clientId
      ? await fetchUsersByClientId(clientId)
      : await fetchAllUsers();

    return NextResponse.json({ users });
  } catch (err) {
    console.error("GET /api/admin/users error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/users
 * Create a new user.
 * Requires division_admin role.
 */
export async function POST(request: NextRequest) {
  const hdrs = await headers();
  const authError = requireAdmin(hdrs);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { email, password, name, role, clientId } = body as {
      email?: string;
      password?: string;
      name?: string;
      role?: string;
      clientId?: string;
    };

    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { error: "email, password, name, and role are required" },
        { status: 400 }
      );
    }

    // Resolve client name if clientId provided
    let clientName = "";
    if (clientId) {
      const client = await fetchClientById(clientId);
      clientName = client?.name ?? "";
    }

    const user = await createUser({
      email,
      password,
      name,
      role,
      clientId,
      clientName,
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    console.error("POST /api/admin/users error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
