/**
 * POST /api/campaigns/[id]/generate-banners
 *
 * Creates ONLY the banner records that are missing for this campaign.
 * Compares Field_Config (configured formats × languages) against
 * existing Airtable banner records and creates the gaps.
 *
 * Auth: division_admin or division_designer.
 *
 * Returns: { bannersCreated, slidesCreated, alreadyExist }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fetchCampaignById } from "@/lib/airtable-campaigns";

export const runtime = "nodejs";

const AIRTABLE_BASE = process.env.AIRTABLE_BASE_ID || "appIqinespXjbIERp";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
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

async function airtablePost(
  tablePath: string,
  body: unknown
): Promise<{ records: AirtableRecord[] }> {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tablePath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Airtable POST error ${res.status}: ${err}`);
  }
  return res.json();
}

async function airtablePatch(
  recordPath: string,
  fields: Record<string, unknown>
): Promise<void> {
  const res = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE}/${recordPath}`,
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
}

async function fetchExistingBanners(campaignId: string): Promise<AirtableRecord[]> {
  const formula = `FIND("${campaignId}", ARRAYJOIN({Campaign Link}))`;
  const params = new URLSearchParams();
  params.set("filterByFormula", formula);
  ["Format_Name", "Language", "Banner_Type", "Slide_Index", "Parent_Banner", "Slide_Count"].forEach(
    (f) => params.append("fields[]", f)
  );

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
  channel: string,
  formatName: string,
  width: number,
  height: number,
  productName: string,
  language: string,
  slideIndex?: number
): string {
  const channelNorm = channel.replace(/[\/\s]+/g, "");
  const productNorm = normaliseForFigma(productName);
  let name = `${channelNorm}_${formatName}_${width}x${height}_${productNorm}_${language}`;
  if (slideIndex !== undefined) name += `_Slide_${slideIndex}`;
  return name;
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

async function createBanners(
  records: { fields: Record<string, unknown> }[]
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await airtablePost(BANNERS_TABLE, { records: batch, typecast: true });
    ids.push(...res.records.map((r) => r.id));
  }
  return ids;
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Auth check
    const { sessionClaims } = await auth();
    const role = (sessionClaims?.metadata as Record<string, unknown> | undefined)?.role as string | undefined;
    if (!role || !["division_admin", "division_designer"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const campaignId = params.id;

    // 1. Fetch campaign record
    const campaign = await fetchCampaignById(campaignId);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const campaignName = campaign.name ?? "";
    const productName = (campaign as { productName?: string }).productName ?? "";
    const fieldConfig = campaign.fieldConfig;

    if (!fieldConfig) {
      return NextResponse.json({ error: "Campaign has no Field_Config" }, { status: 400 });
    }

    const languages: string[] = fieldConfig.languages ?? [];
    const formatNames: string[] = Array.isArray(fieldConfig.formats)
      ? fieldConfig.formats
      : Object.keys(fieldConfig.formats ?? {});
    const formatConfigs = fieldConfig.formatConfigs ?? {};

    if (languages.length === 0 || formatNames.length === 0) {
      return NextResponse.json({ bannersCreated: 0, slidesCreated: 0, alreadyExist: 0 });
    }

    // 2. Fetch existing banners
    const existingBanners = await fetchExistingBanners(campaignId);

    const existingStandardKeys = new Set<string>();
    const existingCarouselMap = new Map<string, { id: string; slideCount: number }>();
    const existingSlideMap = new Map<string, string>();

    for (const b of existingBanners) {
      const formatName = b.fields["Format_Name"] as string | undefined;
      const language = b.fields["Language"] as string | undefined;
      const bannerType = b.fields["Banner_Type"] as string | undefined;
      const slideIndex = b.fields["Slide_Index"] as number | undefined;
      const parentBanner = b.fields["Parent_Banner"] as string[] | undefined;
      const slideCount = (b.fields["Slide_Count"] as number) || 0;
      if (!formatName || !language) continue;
      if (bannerType === "Standard") {
        existingStandardKeys.add(`${formatName}|${language}`);
      } else if (bannerType === "Carousel") {
        existingCarouselMap.set(`${formatName}|${language}`, { id: b.id, slideCount });
      } else if (bannerType === "Slide") {
        if (parentBanner?.length && slideIndex) {
          existingSlideMap.set(`${parentBanner[0]}|${slideIndex}`, b.id);
        }
      }
    }

    // 3. Fetch format records from Formats table
    const formatNameFormula =
      formatNames.length === 1
        ? `{Format_Name}="${formatNames[0]}"`
        : `OR(${formatNames.map((n) => `{Format_Name}="${n}"`).join(",")})`;

    const fmtParams = new URLSearchParams();
    fmtParams.set("filterByFormula", formatNameFormula);
    ["Format_Name", "Width", "Height", "Channel", "Device", "Safe_Area", "Output_Format", "Figma_Frame_Base"].forEach(
      (f) => fmtParams.append("fields[]", f)
    );

    const fmtRes = await airtableFetch(`${FORMATS_TABLE}?${fmtParams.toString()}`);
    const fmtData = fmtRes.ok
      ? ((await fmtRes.json()) as { records: AirtableRecord[] })
      : { records: [] };

    const formatRecordsByName: Record<string, AirtableRecord> = {};
    for (const r of fmtData.records) {
      const name = r.fields["Format_Name"] as string;
      if (name) formatRecordsByName[name] = r;
    }

    // 4. Create missing banners
    let bannersCreated = 0;
    let slidesCreated = 0;
    let alreadyExist = 0;
    const newStandardRecords: { fields: Record<string, unknown> }[] = [];

    for (const formatName of formatNames) {
      const fmtRecord = formatRecordsByName[formatName];
      if (!fmtRecord) continue;

      const f = fmtRecord.fields;
      const width = (f["Width"] as number) || 0;
      const height = (f["Height"] as number) || 0;
      const channel = (f["Channel"] as string) || "";
      const device = (f["Device"] as string) || "";
      const safeArea = (f["Safe_Area"] as string) || "";
      const outputFormat =
        (f["Output_Format"] as string) ||
        (channel.toLowerCase().includes("dooh") ? "JPG" : "PNG");
      const figmaFrameBase =
        (f["Figma_Frame_Base"] as string) ||
        generateFigmaFrame(channel, formatName, width, height);

      const cfg = formatConfigs[formatName] ?? {};
      const mode = (cfg.mode as string) ?? "default";
      const targetSlideCount = (cfg.slideCount as number) ?? 3;

      const baseFields = {
        Campaign_Name: campaignName,
        "Campaign Link": [campaignId],
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
        const key = `${formatName}|${language}`;

        if (mode === "carousel") {
          const existingCarousel = existingCarouselMap.get(key);

          if (!existingCarousel) {
            // Create carousel parent + all slides
            const parentRes = await airtablePost(BANNERS_TABLE, {
              records: [{
                fields: {
                  ...baseFields,
                  Language: language,
                  Banner_Type: "Carousel",
                  Slide_Count: targetSlideCount,
                  Banner_Name: generateBannerName(channel, formatName, width, height, productName, language),
                },
              }],
              typecast: true,
            });
            const parentId = parentRes.records[0].id;
            bannersCreated += 1;

            const slideRecords: { fields: Record<string, unknown> }[] = [];
            for (let s = 0; s < targetSlideCount; s++) {
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
            const createdSlideIds = await createBanners(slideRecords);
            slidesCreated += createdSlideIds.length;
          } else {
            // Carousel parent exists — check if slides need to be added
            const parentId = existingCarousel.id;
            const existingSlideCount = existingCarousel.slideCount;

            if (targetSlideCount !== existingSlideCount) {
              await airtablePatch(`${BANNERS_TABLE}/${parentId}`, { Slide_Count: targetSlideCount });
            }

            if (targetSlideCount > existingSlideCount) {
              const newSlideRecords: { fields: Record<string, unknown> }[] = [];
              for (let s = existingSlideCount + 1; s <= targetSlideCount; s++) {
                if (!existingSlideMap.has(`${parentId}|${s}`)) {
                  newSlideRecords.push({
                    fields: {
                      ...baseFields,
                      Language: language,
                      Figma_Frame: `${figmaFrameBase}_Slide_${s}`,
                      Banner_Type: "Slide",
                      Banner_Name: generateBannerName(channel, formatName, width, height, productName, language, s),
                      Parent_Banner: [parentId],
                      Slide_Index: s,
                    },
                  });
                }
              }
              if (newSlideRecords.length > 0) {
                const createdSlideIds = await createBanners(newSlideRecords);
                slidesCreated += createdSlideIds.length;
              } else {
                alreadyExist++;
              }
            } else {
              alreadyExist++;
            }
          }
        } else {
          // Standard / Specific mode
          if (existingStandardKeys.has(key)) {
            alreadyExist++;
            continue;
          }
          newStandardRecords.push({
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

    // Batch-create all standard banners
    if (newStandardRecords.length > 0) {
      const createdIds = await createBanners(newStandardRecords);
      bannersCreated += createdIds.length;
    }

    return NextResponse.json({ bannersCreated, slidesCreated, alreadyExist });
  } catch (err) {
    console.error("POST /api/campaigns/[id]/generate-banners error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
