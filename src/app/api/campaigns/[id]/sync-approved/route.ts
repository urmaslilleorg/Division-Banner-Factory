export const dynamic = "force-dynamic";
/**
 * POST /api/campaigns/[id]/sync-approved
 *
 * Reads all banners for this campaign, finds those with Approval_Status = "Approved",
 * sets their Banner_Status to "Copy_approved" (if H1_ET is present),
 * calculates Copy_Progress, patches the Campaign record, and returns a summary.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID || "appIqinespXjbIERp";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

async function airtableFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable error ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchAllBannersForCampaign(campaignId: string): Promise<AirtableRecord[]> {
  // Fetch by Campaign Link (linked record field) using FIND formula
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({
      filterByFormula: `FIND("${campaignId}", ARRAYJOIN({Campaign Link}))`,
      pageSize: "100",
    });
    if (offset) params.set("offset", offset);
    const data = await airtableFetch<{ records: AirtableRecord[]; offset?: string }>(
      `${BANNERS_TABLE}?${params}`
    );
    records.push(...data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const campaignId = params.id;
  const errors: string[] = [];

  try {
    // 1. Fetch all banners for this campaign
    const allBanners = await fetchAllBannersForCampaign(campaignId);
    const total = allBanners.length;

    if (total === 0) {
      return NextResponse.json({
        synced: 0,
        skipped: 0,
        total: 0,
        progress: 0,
        errors: ["No banners found for this campaign."],
      });
    }

    // 2. Separate approved banners
    const approvedBanners = allBanners.filter(
      (b) => b.fields["Approval_Status"] === "Approved"
    );
    const approved = approvedBanners.length;

    const synced: string[] = [];
    const skipped: string[] = [];

    // 3. For each approved banner: check H1_ET, then update status
    const toUpdate: Array<{ id: string; fields: Record<string, unknown> }> = [];

    for (const banner of approvedBanners) {
      const h1 = (banner.fields["H1_ET"] as string) || "";
      if (!h1.trim()) {
        skipped.push(banner.id);
      } else {
        toUpdate.push({
          id: banner.id,
          fields: { Status: "Copy_approved" },
        });
        synced.push(banner.id);
      }
    }

    // Batch update in groups of 10 (Airtable limit)
    for (let i = 0; i < toUpdate.length; i += 10) {
      const batch = toUpdate.slice(i, i + 10);
      try {
        await airtableFetch(`${BANNERS_TABLE}`, {
          method: "PATCH",
          body: JSON.stringify({ records: batch }),
        });
      } catch (err) {
        errors.push(`Batch update error: ${String(err)}`);
      }
    }

    // 4. Calculate progress
    const progress = Math.round((approved / total) * 100);

    // 5. Patch Campaign record with Copy_Progress
    try {
      await airtableFetch(`${CAMPAIGNS_TABLE}/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify({
          fields: { Copy_Progress: progress },
        }),
      });
    } catch (err) {
      errors.push(`Failed to update Copy_Progress: ${String(err)}`);
    }

    // 6. Return summary
    return NextResponse.json({
      synced: synced.length,
      skipped: skipped.length,
      total,
      progress,
      errors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), synced: 0, skipped: 0, total: 0, progress: 0, errors: [String(err)] },
      { status: 500 }
    );
  }
}
