export const dynamic = "force-dynamic";
/**
 * GET   /api/campaigns/[id]  — fetch single campaign
 * PATCH /api/campaigns/[id]  — update campaign metadata ONLY
 *
 * Banner creation is intentionally NOT done here.
 * Use POST /api/campaigns/[id]/generate-banners to create missing banners.
 *
 * Fields updated by PATCH:
 *   Campaign_Name, Product_Name, Launch_Month, Field_Config,
 *   Start_Date, End_Date, Copy_Sheet_URL
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchCampaignById } from "@/lib/airtable-campaigns";

export const runtime = "nodejs";

const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID || "appIqinespXjbIERp";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaign = await fetchCampaignById(params.id);
    return NextResponse.json(campaign);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── PATCH ──────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const campaignId = params.id;

    // Map camelCase client keys to Airtable field names
    if ("copySheetUrl" in body) {
      body["Copy_Sheet_URL"] = body["copySheetUrl"] ?? null;
      delete body["copySheetUrl"];
    }

    // Update campaign record — metadata only, no banner creation
    const patchRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/${CAMPAIGNS_TABLE}/${campaignId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: body }),
      }
    );

    if (!patchRes.ok) {
      const text = await patchRes.text();
      return NextResponse.json({ error: text }, { status: patchRes.status });
    }

    const patchData = await patchRes.json();
    return NextResponse.json({ ...patchData, updated: true });
  } catch (err) {
    console.error("PATCH /api/campaigns/[id] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
