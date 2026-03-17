export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getUser } from "@/lib/get-user";
import { updateUser, hashPassword } from "@/lib/users";

function requireAdmin(hdrs: Headers): NextResponse | null {
  const user = getUser(hdrs);
  if (!user || user.role !== "division_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * PATCH /api/admin/users/[id]
 * Update a user's name, role, status, or reset their password.
 * Requires division_admin role.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const hdrs = await headers();
  const authError = requireAdmin(hdrs);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { name, role, status, resetPassword } = body as {
      name?: string;
      role?: string;
      status?: string;
      resetPassword?: string;
    };

    const updates: Parameters<typeof updateUser>[1] = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (status !== undefined) updates.status = status;

    // Handle password reset
    if (resetPassword) {
      if (resetPassword.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters" },
          { status: 400 }
        );
      }
      updates.passwordHash = await hashPassword(resetPassword);
      updates.mustChangePassword = true;
    }

    const user = await updateUser(params.id, updates);
    return NextResponse.json({ user });
  } catch (err) {
    console.error("PATCH /api/admin/users/[id] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users/[id]
 * Soft-delete: sets Status=Disabled.
 * Requires division_admin role.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const hdrs = await headers();
  const authError = requireAdmin(hdrs);
  if (authError) return authError;

  try {
    const user = await updateUser(params.id, { status: "Disabled" });
    return NextResponse.json({ user });
  } catch (err) {
    console.error("DELETE /api/admin/users/[id] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
