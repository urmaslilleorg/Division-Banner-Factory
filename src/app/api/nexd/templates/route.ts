export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/**
 * GET /api/nexd/templates
 * Auth: division_admin only.
 *
 * Returns the list of available Nexd templates for the format mapping dropdown.
 */
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getUser } from "@/lib/get-user";
import { listNexdTemplates } from "@/lib/nexd";

export async function GET() {
  const hdrs = await headers();
  const user = getUser(hdrs);
  if (!user || user.role !== "division_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.NEXD_API_KEY) {
    return NextResponse.json({ templates: [] });
  }

  try {
    const templates = await listNexdTemplates();
    return NextResponse.json({ templates });
  } catch (err) {
    console.error("[nexd/templates] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
