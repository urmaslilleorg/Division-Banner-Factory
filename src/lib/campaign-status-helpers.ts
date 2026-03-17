/**
 * Shared helpers for auto-triggering Campaign_Status transitions.
 *
 * Used by:
 *  - POST /api/banners/[id]/plugin-update  (Pending_Review trigger)
 *  - PATCH /api/banners/[id]/approve       (Approved trigger)
 *
 * All functions are fire-and-forget — they log errors but never throw.
 */

import { triggerStatusNotification, type CampaignStatus } from "@/app/api/campaigns/[id]/status/route";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";

interface AirtableBanner {
  id: string;
  fields: Record<string, unknown>;
}

interface AirtableCampaign {
  id: string;
  fields: Record<string, unknown>;
}

async function fetchBannersForCampaign(campaignId: string): Promise<AirtableBanner[]> {
  const formula = `FIND("${campaignId}",ARRAYJOIN({Campaign Link}))`;
  const params = new URLSearchParams({ filterByFormula: formula, pageSize: "100" });
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}?${params}`,
    {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`Airtable error ${res.status}`);
  const data = await res.json() as { records: AirtableBanner[] };
  return data.records;
}

async function fetchCampaignRaw(campaignId: string): Promise<AirtableCampaign> {
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${CAMPAIGNS_TABLE}/${campaignId}`,
    {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`Airtable error ${res.status}`);
  return res.json() as Promise<AirtableCampaign>;
}

async function patchCampaignStatus(campaignId: string, status: CampaignStatus): Promise<void> {
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${CAMPAIGNS_TABLE}/${campaignId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: { Campaign_Status: status } }),
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable PATCH failed: ${res.status} ${body}`);
  }
}

/**
 * Called after a successful plugin export (plugin-update).
 * Checks if ALL banners for the campaign now have Product_Image_URL.
 * If yes, auto-sets Campaign_Status = Pending_Review and sends email.
 *
 * @param bannerId  The banner that was just exported
 * @param campaignId  The campaign record ID (from the banner's "Campaign Link" field)
 */
export async function maybeAutoSetPendingReview(
  bannerId: string,
  campaignId: string
): Promise<void> {
  try {
    const banners = await fetchBannersForCampaign(campaignId);
    if (banners.length === 0) return;

    // Only consider non-slide banners (slides don't have their own Product_Image_URL)
    const mainBanners = banners.filter(
      (b) => (b.fields["Banner_Type"] as string) !== "Slide"
    );
    if (mainBanners.length === 0) return;

    const allExported = mainBanners.every(
      (b) => typeof b.fields["Product_Image_URL"] === "string" && b.fields["Product_Image_URL"]
    );
    if (!allExported) return;

    // Fetch campaign to check current status
    const campaign = await fetchCampaignRaw(campaignId);
    const currentStatus = campaign.fields["Campaign_Status"] as string | undefined;

    // Only auto-advance if currently In_Design or Ready_For_Figma
    if (currentStatus === "Pending_Review" || currentStatus === "Approved" || currentStatus === "Delivered") {
      return; // Already at or past this stage
    }

    await patchCampaignStatus(campaignId, "Pending_Review");

    const campaignName = (campaign.fields["Campaign Name"] as string) || "";
    const clientName = (campaign.fields["Client_Name"] as string) || "";

    console.log(`[auto-trigger] Campaign ${campaignId} → Pending_Review (all banners exported)`);

    await triggerStatusNotification({
      status: "Pending_Review",
      campaignId,
      campaignName,
      clientName,
    });
  } catch (err) {
    console.error("[auto-trigger] maybeAutoSetPendingReview failed:", err);
  }
}

/**
 * Called after any banner approval PATCH.
 * Checks if ALL banners for the campaign are now Approved.
 * If yes, auto-sets Campaign_Status = Approved and sends email.
 *
 * @param campaignId  The campaign record ID
 */
export async function maybeAutoSetApproved(campaignId: string): Promise<void> {
  try {
    const banners = await fetchBannersForCampaign(campaignId);
    if (banners.length === 0) return;

    const mainBanners = banners.filter(
      (b) => (b.fields["Banner_Type"] as string) !== "Slide"
    );
    if (mainBanners.length === 0) return;

    const allApproved = mainBanners.every(
      (b) => b.fields["Approval_Status"] === "Approved"
    );
    if (!allApproved) return;

    // Fetch campaign to check current status
    const campaign = await fetchCampaignRaw(campaignId);
    const currentStatus = campaign.fields["Campaign_Status"] as string | undefined;

    if (currentStatus === "Approved" || currentStatus === "Delivered") return;

    await patchCampaignStatus(campaignId, "Approved");

    const campaignName = (campaign.fields["Campaign Name"] as string) || "";
    const clientName = (campaign.fields["Client_Name"] as string) || "";

    console.log(`[auto-trigger] Campaign ${campaignId} → Approved (all banners approved)`);

    await triggerStatusNotification({
      status: "Approved",
      campaignId,
      campaignName,
      clientName,
    });
  } catch (err) {
    console.error("[auto-trigger] maybeAutoSetApproved failed:", err);
  }
}
