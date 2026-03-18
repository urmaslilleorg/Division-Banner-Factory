export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/**
 * POST /api/nexd/publish/[bannerId]
 * Auth: division_admin only.
 *
 * Publishes a Nexd creative and updates the banner's Nexd_Status to "published".
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getUser } from "@/lib/get-user";
import { publishCreative } from "@/lib/nexd";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

async function fetchBannerRecord(bannerId: string) {
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}/${bannerId}`,
    {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`Banner not found: ${bannerId}`);
  return res.json() as Promise<{ id: string; fields: Record<string, unknown> }>;
}

async function patchBanner(bannerId: string, fields: Record<string, unknown>) {
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}/${bannerId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) throw new Error(`Airtable PATCH failed: ${await res.text()}`);
  return res.json();
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { bannerId: string } }
) {
  // Auth check
  const hdrs = await headers();
  const user = getUser(hdrs);
  if (!user || user.role !== "division_admin") {
    return NextResponse.json({ error: "Forbidden — division_admin only" }, { status: 403 });
  }

  if (!process.env.NEXD_API_KEY) {
    return NextResponse.json({ error: "NEXD_API_KEY not configured" }, { status: 503 });
  }

  const { bannerId } = params;

  try {
    const banner = await fetchBannerRecord(bannerId);
    const nexdCreativeId = banner.fields.Nexd_Creative_ID as string | undefined;

    if (!nexdCreativeId) {
      return NextResponse.json(
        { error: "Banner has no Nexd_Creative_ID — sync it first" },
        { status: 400 }
      );
    }

    const result = await publishCreative(nexdCreativeId);

    await patchBanner(bannerId, { Nexd_Status: "published" });

    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error("[nexd/publish] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
