export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/**
 * DELETE /api/nexd/delete-creative
 * Body: { creativeId: string }
 * Auth: division_admin only.
 * Deletes a Nexd creative by ID.
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getUser } from "@/lib/get-user";
import { deleteNexdCreative } from "@/lib/nexd";

export async function DELETE(request: NextRequest) {
  const hdrs = await headers();
  const user = getUser(hdrs);
  if (!user || user.role !== "division_admin") {
    return NextResponse.json({ error: "Forbidden — division_admin only" }, { status: 403 });
  }

  if (!process.env.NEXD_API_KEY) {
    return NextResponse.json({ error: "NEXD_API_KEY not configured" }, { status: 503 });
  }

  let creativeId: string;
  try {
    const body = await request.json();
    creativeId = body.creativeId;
    if (!creativeId) throw new Error("creativeId is required");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }

  try {
    await deleteNexdCreative(creativeId);
    return NextResponse.json({ deleted: creativeId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
