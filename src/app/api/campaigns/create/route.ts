import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

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
 * Estonian character normalisation for Figma frame names.
 */
function normaliseForFigma(str: string): string {
  return str
    .replace(/ä/g, "a").replace(/Ä/g, "A")
    .replace(/ö/g, "o").replace(/Ö/g, "O")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/õ/g, "o").replace(/Õ/g, "O")
    .replace(/\s+/g, "_");
}

/**
 * Generate Figma frame name from format data.
 * Pattern: _MASTER_[Channel]_[FormatName]_[W]x[H]
 */
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
    } = body;

    if (!campaignName || !clientName || !launchMonth || !languages.length || !formats.length) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Step a: Create Campaign record
    const fieldConfig = { variables, languages, formats: formats.map((f) => f.id) };

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
      for (const language of languages) {
        const figmaFrame = generateFigmaFrame(
          format.channel,
          format.formatName,
          format.widthPx,
          format.heightPx
        );
        figmaFrames.push(figmaFrame);

        // DOOH → JPG, everything else → PNG
        const outputFormat =
          format.outputFormat ||
          (format.channel?.toLowerCase().includes("dooh") ? "JPG" : "PNG");

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
      figmaFrames: Array.from(new Set(figmaFrames)), // deduplicated
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
