/**
 * Public endpoint (no session required) — called by the Figma plugin.
 * TODO: add API key auth for plugin routes in a future phase.
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { maybeAutoSetPendingReview } from "@/lib/campaign-status-helpers";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * POST /api/banners/[id]/plugin-update
 *
 * Narrow public endpoint — called from the Figma plugin after upload-image.
 * Only accepts imageUrl and status fields to minimise attack surface.
 *
 * Body: { imageUrl?: string, status?: string, campaignId?: string }
 * Returns: { success: true }
 *
 * Auto-trigger: if imageUrl is provided and campaignId is known,
 * checks if all banners are now exported → sets Campaign_Status = Pending_Review.
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as {
      imageUrl?: string;
      status?: string;
      campaignId?: string;
    };
    const { imageUrl, status, campaignId } = body;

    const fields: Record<string, unknown> = {};
    if (imageUrl !== undefined) fields["Product_Image_URL"] = imageUrl;
    if (status !== undefined)   fields["Status"] = status;

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided (accepted: imageUrl, status, campaignId)" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const recordId = params.id;

    // 1. Update the banner record
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}/${recordId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Airtable PATCH error ${res.status}: ${err}`);
    }

    // 2. If an image was exported and we know the campaign, check for auto Pending_Review
    if (imageUrl && campaignId) {
      // Fire-and-forget — do not await to keep response fast
      maybeAutoSetPendingReview(recordId, campaignId).catch((err) =>
        console.error("[plugin-update] auto-trigger error:", err)
      );
    } else if (imageUrl) {
      // campaignId not provided by plugin — fetch it from the updated record
      const updatedRecord = await res.clone().json() as {
        id: string;
        fields: Record<string, unknown>;
      };
      const campaignLink = updatedRecord.fields["Campaign Link"] as string[] | undefined;
      const resolvedCampaignId = campaignLink?.[0];
      if (resolvedCampaignId) {
        maybeAutoSetPendingReview(recordId, resolvedCampaignId).catch((err) =>
          console.error("[plugin-update] auto-trigger error:", err)
        );
      }
    }

    // 3. Bust Next.js cache so the campaign page shows the new Product_Image_URL immediately
    revalidatePath("/", "layout");

    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("plugin-update failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
