/**
 * GET   /api/campaigns/[id]  — fetch single campaign
 * PATCH /api/campaigns/[id]  — update campaign fields + create missing banner records
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchCampaignById } from "@/lib/airtable-campaigns";

export const runtime = "nodejs";

const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID || "appIqinespXjbIERp";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";
const FORMATS_TABLE = "tblSIJqlhuJ6QblzW";

// ── Helpers ────────────────────────────────────────────────────────────────────

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

async function airtableFetch(path: string): Promise<Response> {
  return fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    cache: "no-store",
  });
}

async function airtablePost(tablePath: string, body: unknown): Promise<{ records: AirtableRecord[] }> {
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${tablePath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Airtable POST error ${res.status}: ${err}`);
  }
  return res.json();
}

/** Fetch all banner records linked to a campaign (by Campaign Link record ID) */
async function fetchExistingBanners(campaignId: string): Promise<AirtableRecord[]> {
  const formula = `FIND("${campaignId}", ARRAYJOIN({Campaign Link}))`;
  const params = new URLSearchParams();
  params.set("filterByFormula", formula);
  params.append("fields[]", "Format_Name");
  params.append("fields[]", "Language");
  params.append("fields[]", "Figma_Frame");
  params.append("fields[]", "Banner_Type");

  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    if (offset) params.set("offset", offset);
    const res = await airtableFetch(`${BANNERS_TABLE}?${params.toString()}`);
    if (!res.ok) break;
    const data = (await res.json()) as { records: AirtableRecord[]; offset?: string };
    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

function normaliseForFigma(str: string): string {
  return str
    .replace(/ä/g, "a").replace(/Ä/g, "A")
    .replace(/ö/g, "o").replace(/Ö/g, "O")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/õ/g, "o").replace(/Õ/g, "O")
    .replace(/\s+/g, "_");
}

function generateBannerName(
  channel: string, formatName: string, width: number, height: number,
  productName: string, language: string, slideIndex?: number
): string {
  const channelNorm = channel.replace(/[\/\s]+/g, "");
  const productNorm = normaliseForFigma(productName);
  let name = `${channelNorm}_${formatName}_${width}x${height}_${productNorm}_${language}`;
  if (slideIndex !== undefined) name += `_Slide_${slideIndex}`;
  return name;
}

function generateFigmaFrame(channel: string, formatName: string, width: number, height: number): string {
  const channelNorm = normaliseForFigma(channel.replace(/[/+]/g, ""));
  const formatNorm = normaliseForFigma(formatName);
  return `_MASTER_${channelNorm}_${formatNorm}_${width}x${height}`;
}

/** Create banner records in batches of 10 */
async function createBanners(records: { fields: Record<string, unknown> }[]): Promise<number> {
  let count = 0;
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await airtablePost(BANNERS_TABLE, { records: batch, typecast: true });
    count += res.records.length;
  }
  return count;
}

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

    // ── 1. Update campaign record ─────────────────────────────────────────────
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

    // ── 2. Create missing banner records ──────────────────────────────────────
    // Only proceed if Field_Config is included in the PATCH body
    const fieldConfigRaw = body["Field_Config"];
    if (!fieldConfigRaw) {
      // No Field_Config → simple metadata update, no banner creation needed
      return NextResponse.json({ ...patchData, bannersCreated: 0, totalBanners: 0 });
    }

    let fieldConfig: {
      languages?: string[];
      formats?: string[];
      formatConfigs?: Record<string, {
        variables?: string[];
        mode?: string;
        slideCount?: number;
      }>;
    };
    try {
      fieldConfig = JSON.parse(fieldConfigRaw as string);
    } catch {
      return NextResponse.json({ ...patchData, bannersCreated: 0, totalBanners: 0 });
    }

    const languages: string[] = fieldConfig.languages ?? [];
    const formatNames: string[] = fieldConfig.formats ?? [];
    const formatConfigs = fieldConfig.formatConfigs ?? {};

    if (languages.length === 0 || formatNames.length === 0) {
      return NextResponse.json({ ...patchData, bannersCreated: 0, totalBanners: 0 });
    }

    // ── 3. Fetch existing banners to determine what already exists ────────────
    const existingBanners = await fetchExistingBanners(campaignId);

    // Build a set of existing keys: "FormatName|Language" (for standard) or "Figma_Frame" (for carousel parent)
    const existingKeys = new Set<string>();
    for (const b of existingBanners) {
      const formatName = b.fields["Format_Name"] as string | undefined;
      const language = b.fields["Language"] as string | undefined;
      const figmaFrame = b.fields["Figma_Frame"] as string | undefined;
      const bannerType = b.fields["Banner_Type"] as string | undefined;

      if (formatName && language) {
        existingKeys.add(`${formatName}|${language}`);
      }
      if (figmaFrame) {
        existingKeys.add(figmaFrame);
      }
      // For carousel parents, also key by formatName|language|Carousel
      if (bannerType === "Carousel" && formatName && language) {
        existingKeys.add(`${formatName}|${language}|Carousel`);
      }
    }

    // ── 4. Fetch format records from Formats table by name ────────────────────
    // We need to look up format records by their Format_Name to get IDs + dimensions
    const formatNameFormula =
      formatNames.length === 1
        ? `{Format_Name}="${formatNames[0]}"`
        : `OR(${formatNames.map((n) => `{Format_Name}="${n}"`).join(",")})`;

    const fmtParams = new URLSearchParams();
    fmtParams.set("filterByFormula", formatNameFormula);
    ["Format_Name", "Width_px", "Height_px", "Channel", "Device", "Safe_Area",
     "Output_Format", "Figma_Frame_Base"].forEach((f) => fmtParams.append("fields[]", f));

    const fmtRes = await airtableFetch(`${FORMATS_TABLE}?${fmtParams.toString()}`);
    const fmtData = fmtRes.ok
      ? (await fmtRes.json()) as { records: AirtableRecord[] }
      : { records: [] };

    const formatRecordsByName: Record<string, AirtableRecord> = {};
    for (const r of fmtData.records) {
      const name = r.fields["Format_Name"] as string;
      if (name) formatRecordsByName[name] = r;
    }

    // ── 5. Fetch campaign record to get Campaign_Name and Product_Name ─────────
    const campaignRecord = await fetchCampaignById(campaignId);
    const campaignName = campaignRecord?.name ?? "";
    const productName = (campaignRecord as { productName?: string })?.productName ?? "";

    // ── 6. Build and create missing banner records ────────────────────────────
    let bannersCreated = 0;
    const newBannerRecords: { fields: Record<string, unknown> }[] = [];

    for (const formatName of formatNames) {
      const fmtRecord = formatRecordsByName[formatName];
      if (!fmtRecord) continue; // format not found in Formats table

      const f = fmtRecord.fields;
      const width = (f["Width_px"] as number) || 0;
      const height = (f["Height_px"] as number) || 0;
      const channel = (f["Channel"] as string) || "";
      const device = (f["Device"] as string) || "";
      const safeArea = (f["Safe_Area"] as string) || "";
      const outputFormat = (f["Output_Format"] as string) ||
        (channel.toLowerCase().includes("dooh") ? "JPG" : "PNG");
      const figmaFrameBase = (f["Figma_Frame_Base"] as string) ||
        generateFigmaFrame(channel, formatName, width, height);

      const cfg = formatConfigs[formatName] ?? {};
      const mode = (cfg.mode as string) ?? "default";
      // variables intentionally not used in banner creation (copy is added via Copy Editor)
      const slideCount = (cfg.slideCount as number) ?? 3;

      const baseFields = {
        Campaign_Name: campaignName,
        "Campaign Link": [campaignId],
        Format_Name: formatName,
        Channel: channel,
        Device: device,
        Format: `${width}x${height}`,
        Figma_Frame: figmaFrameBase,
        Safe_Area: safeArea,
        Output_Format: outputFormat,
        Status: "Brief_received",
        Approval_Status: "Pending",
      };

      for (const language of languages) {
        const standardKey = `${formatName}|${language}`;

        if (mode === "carousel") {
          const carouselKey = `${formatName}|${language}|Carousel`;
          if (existingKeys.has(carouselKey)) continue; // already exists

          // Create parent carousel record
          const parentRes = await airtablePost(BANNERS_TABLE, {
            records: [{
              fields: {
                ...baseFields,
                Language: language,
                Banner_Type: "Carousel",
                Banner_Name: generateBannerName(channel, formatName, width, height, productName, language),
              },
            }],
            typecast: true,
          });
          const parentId = parentRes.records[0].id;
          bannersCreated += 1;

          // Create slide records
          const slideRecords: { fields: Record<string, unknown> }[] = [];
          for (let s = 0; s < slideCount; s++) {
            slideRecords.push({
              fields: {
                ...baseFields,
                Language: language,
                Figma_Frame: `${figmaFrameBase}_Slide_${s + 1}`,
                Banner_Type: "Slide",
                Banner_Name: generateBannerName(channel, formatName, width, height, productName, language, s + 1),
                Parent_Banner: [parentId],
                Slide_Index: s + 1,
              },
            });
          }
          const slideCount2 = await createBanners(slideRecords);
          bannersCreated += slideCount2;

        } else {
          // Standard / specific mode
          if (existingKeys.has(standardKey)) continue; // already exists

          newBannerRecords.push({
            fields: {
              ...baseFields,
              Language: language,
              Banner_Type: "Standard",
              Banner_Name: generateBannerName(channel, formatName, width, height, productName, language),
            },
          });
        }
      }
    }

    // Batch-create all standard/specific banners
    if (newBannerRecords.length > 0) {
      bannersCreated += await createBanners(newBannerRecords);
    }

    const totalBanners = existingBanners.length + bannersCreated;

    return NextResponse.json({
      ...patchData,
      updated: true,
      bannersCreated,
      totalBanners,
    });

  } catch (err) {
    console.error("PATCH /api/campaigns/[id] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
