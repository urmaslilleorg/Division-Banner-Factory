export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/**
 * GET /api/nexd/embed/[bannerId]
 * Auth: any authenticated user.
 *
 * Returns the Nexd embed tag for a banner.
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getUser } from "@/lib/get-user";
import { getEmbedTag } from "@/lib/nexd";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

export async function GET(
  _request: NextRequest,
  { params }: { params: { bannerId: string } }
) {
  // Auth check — any authenticated user
  const hdrs = await headers();
  const user = getUser(hdrs);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.NEXD_API_KEY) {
    return NextResponse.json({ error: "NEXD_API_KEY not configured" }, { status: 503 });
  }

  const { bannerId } = params;

  try {
    // Fetch banner to get Nexd_Creative_ID
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}/${bannerId}`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        cache: "no-store",
      }
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Banner not found" }, { status: 404 });
    }
    const banner = await res.json() as { id: string; fields: Record<string, unknown> };
    const nexdCreativeId = banner.fields.Nexd_Creative_ID as string | undefined;

    if (!nexdCreativeId) {
      return NextResponse.json(
        { error: "Banner has no Nexd_Creative_ID" },
        { status: 400 }
      );
    }

    const embedResult = await getEmbedTag(nexdCreativeId);

    return NextResponse.json(embedResult);
  } catch (err) {
    console.error("[nexd/embed] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
