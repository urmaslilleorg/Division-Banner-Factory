export const dynamic = "force-dynamic";
/**
 * POST /api/campaigns/[id]/copy
 *
 * Body: { newName: string, copyBanners?: boolean }
 *
 * Creates a new Campaign record cloned from the source campaign.
 * If copyBanners=true, clones all Standard/Carousel banner records
 * (not Slide records — slides are re-created per carousel parent).
 *
 * Returns: { campaignId, campaignName, bannerCount }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

async function airtableFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Airtable error ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

async function fetchAllRecords(
  table: string,
  filterFormula: string,
  fields?: string[]
): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    params.set("filterByFormula", filterFormula);
    if (fields) fields.forEach((f) => params.append("fields[]", f));
    if (offset) params.set("offset", offset);
    const res = await airtableFetch<{ records: AirtableRecord[]; offset?: string }>(
      `${table}?${params}`
    );
    records.push(...res.records);
    offset = res.offset;
  } while (offset);
  return records;
}

async function createRecords(
  table: string,
  records: { fields: Record<string, unknown> }[]
): Promise<AirtableRecord[]> {
  const created: AirtableRecord[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await airtableFetch<{ records: AirtableRecord[] }>(table, {
      method: "POST",
      body: JSON.stringify({ records: batch, typecast: true }),
    });
    created.push(...res.records);
  }
  return created;
}

// Fields to exclude when cloning a campaign record
const CAMPAIGN_EXCLUDE = new Set([
  "Campaign Name",
  "Active",
  "Last_Import",
  "Banners", // linked field — will be re-linked via banner creation
]);

// Fields to exclude when cloning a banner record
const BANNER_EXCLUDE = new Set([
  "Campaign Link",
  "Campaign_Name",
  "Banner_ID",
  "Parent_Banner",
  "Slides", // inverse link
  "Approval_Status",
  "Status",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sourceCampaignId = params.id;
  const { newName, copyBanners = false } = await req.json() as {
    newName: string;
    copyBanners?: boolean;
  };

  if (!newName?.trim()) {
    return NextResponse.json({ error: "newName is required" }, { status: 400 });
  }

  // Fetch source campaign
  const source = await airtableFetch<AirtableRecord>(
    `${CAMPAIGNS_TABLE}/${sourceCampaignId}`
  );
  const sourceFields = source.fields;

  // Build new campaign fields (clone, override name + reset dates)
  const newCampaignFields: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(sourceFields)) {
    if (CAMPAIGN_EXCLUDE.has(key)) continue;
    if (val === null || val === undefined) continue;
    // Skip linked record arrays (Airtable returns them as arrays of IDs)
    if (Array.isArray(val) && typeof val[0] === "string" && val[0].startsWith("rec")) continue;
    newCampaignFields[key] = val;
  }
  newCampaignFields["Campaign Name"] = newName.trim();
  newCampaignFields["Active"] = true;

  // Create new campaign record
  const newCampaign = await airtableFetch<AirtableRecord>(CAMPAIGNS_TABLE, {
    method: "POST",
    body: JSON.stringify({ fields: newCampaignFields }),
  });
  const newCampaignId = newCampaign.id;

  let bannerCount = 0;

  if (copyBanners) {
    // Fetch all Standard + Carousel banners from source campaign
    const sourceName = (sourceFields["Campaign Name"] as string) || "";
    const sourceBanners = await fetchAllRecords(
      BANNERS_TABLE,
      `AND({Campaign_Name}="${sourceName}",OR({Banner_Type}="Standard",{Banner_Type}="Carousel"))`
    );

    // For each carousel parent, also fetch its slides
    const carouselParents = sourceBanners.filter(
      (b) => b.fields["Banner_Type"] === "Carousel"
    );
    const carouselSlides: AirtableRecord[] = [];
    for (const parent of carouselParents) {
      const slides = await fetchAllRecords(
        BANNERS_TABLE,
        `{Parent_Banner}="${parent.id}"`
      );
      carouselSlides.push(...slides);
    }

    // Map old parent IDs → new parent IDs (filled after creation)
    const parentIdMap = new Map<string, string>();

    // Clone Standard + Carousel records
    const toCreate: { fields: Record<string, unknown> }[] = [];
    for (const banner of sourceBanners) {
      const fields: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(banner.fields)) {
        if (BANNER_EXCLUDE.has(key)) continue;
        if (val === null || val === undefined) continue;
        if (Array.isArray(val) && typeof val[0] === "string" && val[0].startsWith("rec")) continue;
        fields[key] = val;
      }
      fields["Campaign_Name"] = newName.trim();
      fields["Campaign Link"] = [newCampaignId];
      fields["Status"] = "Brief_received";
      fields["Approval_Status"] = "Pending";
      toCreate.push({ fields });
    }

    const createdBanners = await createRecords(BANNERS_TABLE, toCreate);
    bannerCount += createdBanners.length;

    // Build parent ID map: old → new
    for (let i = 0; i < sourceBanners.length; i++) {
      if (sourceBanners[i].fields["Banner_Type"] === "Carousel") {
        parentIdMap.set(sourceBanners[i].id, createdBanners[i].id);
      }
    }

    // Clone slide records, re-linking to new parent IDs
    if (carouselSlides.length > 0) {
      const slideRecords: { fields: Record<string, unknown> }[] = [];
      for (const slide of carouselSlides) {
        const fields: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(slide.fields)) {
          if (BANNER_EXCLUDE.has(key)) continue;
          if (val === null || val === undefined) continue;
          if (Array.isArray(val) && typeof val[0] === "string" && val[0].startsWith("rec")) continue;
          fields[key] = val;
        }
        fields["Campaign_Name"] = newName.trim();
        fields["Campaign Link"] = [newCampaignId];
        fields["Status"] = "Brief_received";
        fields["Approval_Status"] = "Pending";

        // Re-link to new parent
        const oldParentIds = slide.fields["Parent_Banner"] as string[] | undefined;
        if (oldParentIds?.[0]) {
          const newParentId = parentIdMap.get(oldParentIds[0]);
          if (newParentId) fields["Parent_Banner"] = [newParentId];
        }

        slideRecords.push({ fields });
      }
      const createdSlides = await createRecords(BANNERS_TABLE, slideRecords);
      bannerCount += createdSlides.length;
    }
  }

  return NextResponse.json({
    campaignId: newCampaignId,
    campaignName: newName.trim(),
    bannerCount,
  });
}
