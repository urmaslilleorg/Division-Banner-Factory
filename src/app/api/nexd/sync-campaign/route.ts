export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/**
 * POST /api/nexd/sync-campaign
 * Auth: division_admin only.
 *
 * Pushes all approved banners (with Product_Image_URL) from a Mente campaign
 * to Nexd. Creates a Nexd campaign if one doesn't exist yet.
 *
 * Body: { campaignId: string }  — Airtable record ID of the campaign
 *
 * Returns: { synced: number, skipped: number, errors: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getUser } from "@/lib/get-user";
import { sendNotification } from "@/lib/email";
import { fetchAllUsers } from "@/lib/users";
import {
  createNexdCampaign,
  createNexdCreative,
  getPrimarySlot,
  smartUploadAssetDebug,
  getEmbedTag,
  type UploadDebugInfo,
} from "@/lib/nexd";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";
const FORMATS_TABLE = "tblSIJqlhuJ6QblzW";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://menteproduction.com";

function airtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function airtableGet(url: string) {
  return fetch(url, { headers: airtableHeaders(), cache: "no-store" });
}

async function airtablePatch(table: string, recordId: string, fields: Record<string, unknown>) {
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${table}/${recordId}`,
    {
      method: "PATCH",
      headers: airtableHeaders(),
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Airtable PATCH failed: ${err}`);
  }
  return res.json();
}

// ─── Fetch campaign record ────────────────────────────────────────────────────

interface AirtableCampaign {
  id: string;
  fields: {
    "Campaign Name"?: string;
    Client_Name?: string;
    Nexd_Campaign_ID?: string;
  };
}

async function fetchCampaignRecord(campaignId: string): Promise<AirtableCampaign> {
  const res = await airtableGet(
    `https://api.airtable.com/v0/${BASE_ID}/${CAMPAIGNS_TABLE}/${campaignId}`
  );
  if (!res.ok) throw new Error(`Campaign not found: ${campaignId}`);
  return res.json();
}

// ─── Fetch banners for campaign ───────────────────────────────────────────────

interface AirtableBanner {
  id: string;
  fields: {
    Banner_Name?: string;
    Format_Name?: string;
    Product_Image_URL?: string;
    Approval_Status?: string;
    Nexd_Status?: string;
    Nexd_Creative_ID?: string;
    /** Per-banner override: specific Nexd template ID to use for this banner */
    Nexd_Selected_Template?: string;
    Width?: number;
    Height?: number;
  };
}

interface BannerDebugCounts {
  totalBanners: number;
  withImage: number;
  approved: number;
  alreadySynced: number;
  eligible: number;
}

async function fetchAllBannersForCampaign(campaignName: string): Promise<AirtableBanner[]> {
  // Filter by Campaign_Name text field — same approach as fetchBanners() in airtable.ts
  // (ARRAYJOIN on a linked record field returns display names, not record IDs)
  const safeName = campaignName.replace(/"/g, "'");
  const formula = `FIND("${safeName}",{Campaign_Name})`;
  const banners: AirtableBanner[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams({ filterByFormula: formula, pageSize: "100" });
    if (offset) params.set("offset", offset);
    const res = await airtableGet(
      `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}?${params}`
    );
    if (!res.ok) throw new Error(`Failed to fetch banners: ${await res.text()}`);
    const data = await res.json();
    banners.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return banners;
}

function filterEligibleBanners(banners: AirtableBanner[]): { eligible: AirtableBanner[]; debug: BannerDebugCounts } {
  const totalBanners = banners.length;
  const withImage = banners.filter((b) => !!b.fields.Product_Image_URL?.trim()).length;
  const approved = banners.filter((b) =>
    (b.fields.Approval_Status ?? "").toLowerCase() === "approved"
  ).length;
  const alreadySynced = banners.filter((b) =>
    b.fields.Nexd_Status === "uploaded" || b.fields.Nexd_Status === "published"
  ).length;

  const eligible = banners.filter((b) => {
    const hasImage = !!b.fields.Product_Image_URL?.trim();
    const isApproved = (b.fields.Approval_Status ?? "").toLowerCase() === "approved";
    const notSynced = b.fields.Nexd_Status !== "uploaded" && b.fields.Nexd_Status !== "published";
    return hasImage && isApproved && notSynced;
  });

  return {
    eligible,
    debug: { totalBanners, withImage, approved, alreadySynced, eligible: eligible.length },
  };
}

// ─── Format lookup (cached per request) ──────────────────────────────────────

interface FormatRecord {
  Nexd_Template_ID?: string;
  /** JSON array of all mapped Nexd template IDs for this format */
  Nexd_Template_IDs?: string[];
  Width?: number;
  Height?: number;
}

const formatCache = new Map<string, FormatRecord>();

async function getFormatByName(formatName: string): Promise<FormatRecord | null> {
  if (formatCache.has(formatName)) return formatCache.get(formatName)!;

  const formula = encodeURIComponent(`{Format_Name}="${formatName}"`);
  const res = await airtableGet(
    `https://api.airtable.com/v0/${BASE_ID}/${FORMATS_TABLE}?filterByFormula=${formula}&maxRecords=1`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const record = data.records?.[0];
  if (!record) return null;

  const rawIds = record.fields.Nexd_Template_IDs as string | undefined;
  let parsedIds: string[] = [];
  if (rawIds) {
    try { parsedIds = JSON.parse(rawIds); } catch { parsedIds = []; }
  }
  const fmt: FormatRecord = {
    Nexd_Template_ID: record.fields.Nexd_Template_ID || undefined,
    Nexd_Template_IDs: parsedIds.length > 0 ? parsedIds : undefined,
    Width: record.fields.Width || undefined,
    Height: record.fields.Height || undefined,
  };
  formatCache.set(formatName, fmt);
  return fmt;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth check — division_admin only
  const hdrs = await headers();
  const user = getUser(hdrs);
  if (!user || user.role !== "division_admin") {
    return NextResponse.json({ error: "Forbidden — division_admin only" }, { status: 403 });
  }

  // Check Nexd API key
  if (!process.env.NEXD_API_KEY) {
    return NextResponse.json({ error: "NEXD_API_KEY not configured" }, { status: 503 });
  }

  let campaignId: string;
  try {
    const body = await request.json();
    campaignId = body.campaignId;
    if (!campaignId) throw new Error("campaignId is required");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }

  const synced: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  try {
    // 1. Fetch campaign
    const campaign = await fetchCampaignRecord(campaignId);
    const campaignName = campaign.fields["Campaign Name"] ?? "Unnamed Campaign";
    const clientName = campaign.fields.Client_Name ?? "";

    // 2. Get or create Nexd campaign
    let nexdCampaignId = campaign.fields.Nexd_Campaign_ID;
    if (!nexdCampaignId) {
      const nexdCampaign = await createNexdCampaign(campaignName);
      nexdCampaignId = nexdCampaign.campaignId;
      await airtablePatch(CAMPAIGNS_TABLE, campaignId, { Nexd_Campaign_ID: nexdCampaignId });
    }

    // 3. Fetch ALL banners for this campaign, then filter in JS
    // Uses Campaign_Name field (same as fetchBanners in airtable.ts) because
    // ARRAYJOIN on a linked record field returns display names, not record IDs.
    const allBanners = await fetchAllBannersForCampaign(campaignName);
    const { eligible: banners, debug: debugCounts } = filterEligibleBanners(allBanners);

    // 4. Process each eligible banner
    let uploadDebugCapture: UploadDebugInfo | null = null;
    let createResponseCapture: unknown = null;
    for (const banner of banners) {
      const f = banner.fields;
      const bannerName = f.Banner_Name ?? banner.id;

      // Look up format
      const formatName = f.Format_Name ?? "";
      const format = formatName ? await getFormatByName(formatName) : null;

      // Resolve Nexd template ID:
      // 1. Banner-level override (Nexd_Selected_Template) takes priority
      // 2. Fall back to first ID in format's Nexd_Template_IDs array
      // 3. Fall back to legacy Nexd_Template_ID single field
      const resolvedTemplateId =
        f.Nexd_Selected_Template ||
        (format?.Nexd_Template_IDs?.[0]) ||
        format?.Nexd_Template_ID;

      if (!resolvedTemplateId) {
        skipped.push(`${bannerName} (no Nexd template for format "${formatName}")`);
        continue;
      }

      const width = format?.Width ?? f.Width ?? 300;
      const height = format?.Height ?? f.Height ?? 250;
      const imageUrl = f.Product_Image_URL!;

      let uploadDebug: UploadDebugInfo | null = null;
      let createDebugCapture: unknown = null;
      try {
        // a. Create Nexd creative — with automatic recovery if the stored campaign ID is stale
        let creative;
        try {
          creative = await createNexdCreative(
            nexdCampaignId,
            bannerName,
            resolvedTemplateId,
            width,
            height
          );
        } catch (createErr) {
          // If the Nexd campaign no longer exists (404), create a fresh one and retry
          if (String(createErr).includes("404")) {
            const freshCampaign = await createNexdCampaign(campaignName);
            nexdCampaignId = freshCampaign.campaignId;
            await airtablePatch(CAMPAIGNS_TABLE, campaignId, { Nexd_Campaign_ID: nexdCampaignId });
            creative = await createNexdCreative(
              nexdCampaignId,
              bannerName,
              resolvedTemplateId,
              width,
              height
            );
          } else {
            throw createErr;
          }
        }
        createDebugCapture = creative._rawResult; // capture full create response

        // b. Get primary slot
        const primarySlot = await getPrimarySlot(resolvedTemplateId);

        // c. Upload image to creative slot (debug variant captures full response)
        const { debug } = await smartUploadAssetDebug(
          creative.creativeId,
          primarySlot.slotId,
          imageUrl
        );
        uploadDebug = debug;

        // d. Get embed tag
        const embedResult = await getEmbedTag(creative.creativeId);

        // e. Update banner record in Airtable
        await airtablePatch(BANNERS_TABLE, banner.id, {
          Nexd_Creative_ID: creative.creativeId,
          Nexd_Embed_Tag: embedResult.tag ?? "",
          Nexd_Status: "uploaded",
        });

        synced.push(`${bannerName} [template=${resolvedTemplateId} slot=${primarySlot.slotId} creative=${creative.creativeId}]`);
      } catch (bannerErr) {
        const errWithDebug = bannerErr as { uploadDebug?: UploadDebugInfo };
        if (errWithDebug.uploadDebug) uploadDebug = errWithDebug.uploadDebug;
        errors.push(`${bannerName}: ${String(bannerErr)}`);
      }
      // Attach upload debug to the first banner processed
      if (uploadDebug && !uploadDebugCapture) uploadDebugCapture = uploadDebug;
      if (createDebugCapture && !createResponseCapture) createResponseCapture = createDebugCapture;
    }

    // 5. Fire-and-forget email notification if any banners were synced
    if (synced.length > 0) {
      (async () => {
        try {
          const allUsers = await fetchAllUsers();
          const adminUsers = allUsers.filter((u) => u.role === "division_admin" && u.email);
          const campaignUrl = `${APP_URL}/campaigns/${campaignId}`;
          for (const admin of adminUsers) {
            await sendNotification({
              to: [admin.email],
              subject: `${campaignName} — ${synced.length} banner${synced.length !== 1 ? "s" : ""} synced to Nexd`,
              recipientName: admin.name,
              campaignName,
              clientName,
              message: `Campaign "${campaignName}" has ${synced.length} banner${synced.length !== 1 ? "s" : ""} ready in Nexd.`,
              actionUrl: campaignUrl,
            });
          }
        } catch (emailErr) {
          console.error("[nexd/sync] Email notification failed:", emailErr);
        }
      })();
    }

    return NextResponse.json({
      synced: synced.length,
      skipped: skipped.length,
      errors,
      syncedNames: synced,
      skippedNames: skipped,
      debug: debugCounts,
      uploadDebug: uploadDebugCapture,
      createDebug: createResponseCapture,
    });
  } catch (err) {
    console.error("[nexd/sync-campaign] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
