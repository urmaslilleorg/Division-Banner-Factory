/**
 * GET /api/campaigns/[id]
 * Returns a single campaign record by Airtable record ID.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchCampaignById } from "@/lib/airtable-campaigns";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaign = await fetchCampaignById(params.id);
    return NextResponse.json(campaign);
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
