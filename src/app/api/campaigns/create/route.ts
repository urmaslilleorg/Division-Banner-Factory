import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";
const FORMATS_TABLE = "tblSIJqlhuJ6QblzW";

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

async function airtablePost<T>(tablePath: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tablePath}`, {
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
  return res.json() as Promise<T>;
}

/**
 * Fetch Figma_Frame_Base values from the Formats table for a set of record IDs.
 */
async function fetchFigmaFrameBases(
  formatIds: string[]
): Promise<Record<string, string>> {
  const uniqueIds = Array.from(new Set(formatIds));
  if (uniqueIds.length === 0) return {};

  const formula =
    uniqueIds.length === 1
      ? `RECORD_ID()="${uniqueIds[0]}"`
      : `OR(${uniqueIds.map((id) => `RECORD_ID()="${id}"`).join(",")})`;

  const params = new URLSearchParams();
  params.set("filterByFormula", formula);
  params.append("fields[]", "Figma_Frame_Base");
  params.append("fields[]", "Format_Name");

  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${FORMATS_TABLE}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
  );
  if (!res.ok) return {};

  const data = (await res.json()) as { records: AirtableRecord[] };
  const map: Record<string, string> = {};
  for (const record of data.records) {
    const base = record.fields["Figma_Frame_Base"] as string | undefined;
    if (base) map[record.id] = base;
  }
  return map;
}

function normaliseForFigma(str: string): string {
  return str
    .replace(/ä/g, "a").replace(/Ä/g, "A")
    .replace(/ö/g, "o").replace(/Ö/g, "O")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/õ/g, "o").replace(/Õ/g, "O")
    .replace(/\s+/g, "_");
}

function generateFigmaFrame(
  channel: string,
  formatName: string,
  width: number,
  height: number
): string {
  const channelNorm = normaliseForFigma(channel.replace(/[/+]/g, ""));
  const formatNorm = normaliseForFigma(formatName);
  return `_MASTER_${channelNorm}_${formatNorm}_${width}x${height}`;
}

/**
 * Map a variable ID + language to the correct Airtable field name.
 *
 * Rules:
 *   - Text variables (H1, H2, H3, CTA) → `${varId}_${language}` (e.g. H1_ET, CTA_EN)
 *   - Non-language variables (Price_Tag, Illustration, Output_Format, Safe_Area, …)
 *     → use the varId directly as the field name
 *
 * Empty values are skipped (not written to Airtable).
 */
const LANGUAGE_SUFFIXED_VARS = new Set(["H1", "H2", "H3", "CTA"]);

function buildCopyFields(
  variables: string[],
  copyValues: Record<string, string>,
  language: string
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const varId of variables) {
    const value = copyValues[varId];
    if (!value || value.trim() === "") continue; // skip empty
    const fieldName = LANGUAGE_SUFFIXED_VARS.has(varId)
      ? `${varId}_${language}`
      : varId;
    fields[fieldName] = value.trim();
  }
  return fields;
}

// Per-slide copy: Record<varId, value>
type SlideCopy = Record<string, string>;

export interface FormatInput {
  id: string;
  formatName: string;
  widthPx: number;
  heightPx: number;
  channel: string;
  device: string;
  safeArea: string;
  outputFormat: string;
  figmaFrameBase?: string;
  variables: string[];
  carousel: boolean;
  slideCount: number;
  /** Per-slide copy values, indexed 0…slideCount-1. Only present when carousel=true. */
  slides?: SlideCopy[];
}

export interface CreateCampaignRequest {
  campaignName: string;
  clientName: string;
  launchMonth: string;
  startDate: string;
  endDate: string;
  languages: string[];
  defaultCopy?: Record<string, string | null>;
  formats: FormatInput[];
  fieldConfigFormats?: Record<string, { variables: string[]; carousel: boolean; slideCount: number }>;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as CreateCampaignRequest;
    const {
      campaignName,
      clientName,
      launchMonth,
      startDate,
      endDate,
      languages,
      formats,
      defaultCopy,
      fieldConfigFormats,
    } = body;

    if (!campaignName || !clientName || !launchMonth || !languages.length || !formats.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch Figma_Frame_Base values from Formats table
    const formatIds = formats.map((f) => f.id);
    const figmaFrameBaseMap = await fetchFigmaFrameBases(formatIds);

    // Build Field_Config — per-format variables + carousel config
    const fieldConfig = {
      languages,
      formats: fieldConfigFormats ?? {},
    };

    // Step a: Create Campaign record
    const campaignRecord = await airtablePost<AirtableRecord>(CAMPAIGNS_TABLE, {
      fields: {
        "Campaign Name": campaignName,
        Client_Name: clientName,
        Active: true,
        "Start Date": startDate || undefined,
        "End Date": endDate || undefined,
        Launch_Month: launchMonth,
        Field_Config: JSON.stringify(fieldConfig),
      },
    });

    const campaignId = campaignRecord.id;

    // Step b: Create Banner records — one per format × language
    // For carousel formats: create parent (Carousel) + N slide records (Slide)
    const figmaFrames: string[] = [];
    const standardBannerRecords: { fields: Record<string, unknown> }[] = [];

    const carouselFormats = formats.filter((f) => f.carousel);
    const standardFormats = formats.filter((f) => !f.carousel);

    // ── Standard banners ─────────────────────────────────────────────────────
    for (const format of standardFormats) {
      const figmaFrame =
        figmaFrameBaseMap[format.id] ||
        generateFigmaFrame(format.channel, format.formatName, format.widthPx, format.heightPx);

      for (const language of languages) {
        figmaFrames.push(figmaFrame);

        const outputFormat =
          format.outputFormat ||
          (format.channel?.toLowerCase().includes("dooh") ? "JPG" : "PNG");

        // Merge defaultCopy into copy fields using language-aware mapping
        const defaultCopyValues: Record<string, string> = {};
        if (defaultCopy) {
          for (const varId of format.variables) {
            const v = defaultCopy[varId];
            if (v) defaultCopyValues[varId] = v;
          }
        }
        const copyFields = buildCopyFields(format.variables, defaultCopyValues, language);

        standardBannerRecords.push({
          fields: {
            Campaign_Name: campaignName,
            "Campaign Link": [campaignId],
            Language: language,
            Channel: format.channel,
            Device: format.device,
            Format: `${format.widthPx}x${format.heightPx}`,
            Figma_Frame: figmaFrame,
            Safe_Area: format.safeArea || "",
            Output_Format: outputFormat,
            Status: "Brief_received",
            Approval_Status: "Pending",
            Banner_Type: "Standard",
            ...copyFields,
          },
        });
      }
    }

    // Create standard banners in batches of 10
    const createdBannerIds: string[] = [];
    for (let i = 0; i < standardBannerRecords.length; i += 10) {
      const batch = standardBannerRecords.slice(i, i + 10);
      const res = await airtablePost<{ records: AirtableRecord[] }>(BANNERS_TABLE, {
        records: batch,
        typecast: true,
      });
      createdBannerIds.push(...res.records.map((r) => r.id));
    }

    // ── Carousel banners ──────────────────────────────────────────────────────
    for (const format of carouselFormats) {
      const figmaFrame =
        figmaFrameBaseMap[format.id] ||
        generateFigmaFrame(format.channel, format.formatName, format.widthPx, format.heightPx);

      figmaFrames.push(figmaFrame);

      const outputFormat =
        format.outputFormat ||
        (format.channel?.toLowerCase().includes("dooh") ? "JPG" : "PNG");

      for (const language of languages) {
        // Parent copy from defaultCopy
        const defaultCopyValues: Record<string, string> = {};
        if (defaultCopy) {
          for (const varId of format.variables) {
            const v = defaultCopy[varId];
            if (v) defaultCopyValues[varId] = v;
          }
        }
        const parentCopyFields = buildCopyFields(format.variables, defaultCopyValues, language);

        // Create parent (Carousel) record
        const parentRes = await airtablePost<{ records: AirtableRecord[] }>(BANNERS_TABLE, {
          records: [{
            fields: {
              Campaign_Name: campaignName,
              "Campaign Link": [campaignId],
              Language: language,
              Channel: format.channel,
              Device: format.device,
              Format: `${format.widthPx}x${format.heightPx}`,
              Figma_Frame: figmaFrame,
              Safe_Area: format.safeArea || "",
              Output_Format: outputFormat,
              Status: "Brief_received",
              Approval_Status: "Pending",
              Banner_Type: "Carousel",
              ...parentCopyFields,
            },
          }],
          typecast: true,
        });

        const parentId = parentRes.records[0].id;
        createdBannerIds.push(parentId);

        // Create slide records and link to parent
        const slideCount = format.slideCount ?? 3;
        const slidesData: SlideCopy[] = format.slides ?? [];
        const slideRecords: { fields: Record<string, unknown> }[] = [];

        for (let s = 0; s < slideCount; s++) {
          const slideValues = slidesData[s] ?? {};
          // Merge defaultCopy as fallback for empty slide fields
          const mergedValues: Record<string, string> = {};
          for (const varId of format.variables) {
            const slideVal = slideValues[varId];
            const defaultVal = defaultCopy?.[varId];
            if (slideVal && slideVal.trim()) {
              mergedValues[varId] = slideVal.trim();
            } else if (defaultVal && defaultVal.trim()) {
              mergedValues[varId] = defaultVal.trim();
            }
          }
          const slideCopyFields = buildCopyFields(format.variables, mergedValues, language);

          slideRecords.push({
            fields: {
              Campaign_Name: campaignName,
              "Campaign Link": [campaignId],
              Language: language,
              Channel: format.channel,
              Device: format.device,
              Format: `${format.widthPx}x${format.heightPx}`,
              Figma_Frame: `${figmaFrame}_Slide_${s + 1}`,
              Safe_Area: format.safeArea || "",
              Output_Format: outputFormat,
              Status: "Brief_received",
              Approval_Status: "Pending",
              Banner_Type: "Slide",
              Parent_Banner: [parentId],
              Slide_Index: s + 1,
              ...slideCopyFields,
            },
          });
        }

        // Create slides in batches of 10
        for (let i = 0; i < slideRecords.length; i += 10) {
          const batch = slideRecords.slice(i, i + 10);
          const slideRes = await airtablePost<{ records: AirtableRecord[] }>(BANNERS_TABLE, {
            records: batch,
            typecast: true,
          });
          createdBannerIds.push(...slideRes.records.map((r) => r.id));
        }
      }
    }

    return NextResponse.json({
      campaignId,
      bannerCount: createdBannerIds.length,
      figmaFrames: Array.from(new Set(figmaFrames)),
      bannerIds: createdBannerIds,
    });
  } catch (error) {
    console.error("Campaign create failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
