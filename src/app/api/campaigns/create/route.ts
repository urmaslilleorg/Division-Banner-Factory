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
 * Returns a map of formatRecordId → Figma_Frame_Base string.
 */
async function fetchFigmaFrameBases(
  formatIds: string[]
): Promise<Record<string, string>> {
  const uniqueIds = Array.from(new Set(formatIds));
  if (uniqueIds.length === 0) return {};

  // Build a filterByFormula using RECORD_ID() matching
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
    {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    }
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

/**
 * Fallback: generate Figma frame name from format data.
 * Used when Figma_Frame_Base is not set on the Formats record.
 * Pattern: _MASTER_[Channel]_[FormatName]_[W]x[H]
 */
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

export interface CreateCampaignRequest {
  campaignName: string;
  clientName: string;
  launchMonth: string;
  startDate: string;
  endDate: string;
  languages: string[];
  defaultCopy?: {
    h1?: string | null;
    h2?: string | null;
    h3?: string | null;
    cta?: string | null;
  };
  formats: {
    id: string;
    formatName: string;
    widthPx: number;
    heightPx: number;
    channel: string;
    device: string;
    safeArea: string;
    outputFormat: string;
  }[];
  variables: string[];
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
      variables,
      defaultCopy,
    } = body;

    if (!campaignName || !clientName || !launchMonth || !languages.length || !formats.length) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Fetch Figma_Frame_Base values from Formats table
    const formatIds = formats.map((f) => f.id);
    const figmaFrameBaseMap = await fetchFigmaFrameBases(formatIds);

    // Step a: Create Campaign record
    const fieldConfig = { variables, languages, formats: formatIds };

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
    const figmaFrames: string[] = [];
    const bannerRecords: { fields: Record<string, unknown> }[] = [];

    for (const format of formats) {
      // Use Figma_Frame_Base from Formats table; fall back to generated name
      const figmaFrame =
        figmaFrameBaseMap[format.id] ||
        generateFigmaFrame(format.channel, format.formatName, format.widthPx, format.heightPx);

      for (const language of languages) {
        figmaFrames.push(figmaFrame);

        const outputFormat =
          format.outputFormat ||
          (format.channel?.toLowerCase().includes("dooh") ? "JPG" : "PNG");

        // Build copy fields from defaultCopy if provided
        const copyFields: Record<string, string> = {};
        if (defaultCopy) {
          if (defaultCopy.h1) copyFields[`H1_${language}`] = defaultCopy.h1;
          if (defaultCopy.h2) copyFields[`H2_${language}`] = defaultCopy.h2;
          if (defaultCopy.h3) copyFields[`H3_${language}`] = defaultCopy.h3;
          if (defaultCopy.cta) copyFields[`CTA_${language}`] = defaultCopy.cta;
        }

        bannerRecords.push({
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
            ...copyFields,
          },
        });
      }
    }

    // Create in batches of 10
    const createdBannerIds: string[] = [];
    for (let i = 0; i < bannerRecords.length; i += 10) {
      const batch = bannerRecords.slice(i, i + 10);
      const res = await airtablePost<{ records: AirtableRecord[] }>(BANNERS_TABLE, {
        records: batch,
        typecast: true,
      });
      createdBannerIds.push(...res.records.map((r) => r.id));
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
