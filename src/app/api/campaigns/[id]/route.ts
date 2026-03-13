/**
 * GET   /api/campaigns/[id]  — fetch single campaign
 * PATCH /api/campaigns/[id]  — update campaign fields + create missing banner records
 *
 * Implementation rules (never violate):
 * 1. NEVER auto-delete banner records on edit. Only CREATE new ones.
 * 2. NEVER wipe copy field values when variables change.
 * 3. CASCADE delete slides when parent Carousel is deleted (handled in DELETE /api/banners/[id]).
 * 4. Do NOT allow individual slide deletion from Preview tab.
 * 5. Match existing banners by: Format_Name + Language (standard) or
 *    Format_Name + Language + Banner_Type=Carousel (carousel parent).
 * 6. Match slides by Parent_Banner record ID + Slide_Index.
 * 7. New banners: Status=Brief_received, Approval_Status=Pending.
 * 8. Batch creates in groups of 10 with typecast:true.
 * 9. Scenario 4/5: When carousel exists, update Slide_Count on parent and
 *    create only the NEW slides (Slide_Index > existing max).
 * 10. Scenario 6: Standard→Carousel: existing standard banner is NOT mutated.
 *     New carousel parent + slides are created alongside it.
 * 11. Scenario 7: Carousel→Standard: existing carousel parent + slides are NOT
 *     deleted. New standard banner is created alongside them.
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

/**
 * Fetch all banner records linked to a campaign.
 * Returns Format_Name, Language, Banner_Type, Slide_Index, Parent_Banner, Figma_Frame, Slide_Count.
 */
async function fetchExistingBanners(campaignId: string): Promise<AirtableRecord[]> {
  const formula = `FIND("${campaignId}", ARRAYJOIN({Campaign Link}))`;
  const params = new URLSearchParams();
  params.set("filterByFormula", formula);
  [
    "Format_Name",
    "Language",
    "Figma_Frame",
    "Banner_Type",
    "Slide_Index",
    "Parent_Banner",
    "Slide_Count",
  ].forEach((f) => params.append("fields[]", f));

  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    if (offset) params.set("offset", offset);
    const res = await airtableFetch(`${BANNERS_TABLE}?${params.toString()}`);
    if (!res.ok) break;
    const data = (await res.json()) as {
      records: AirtableRecord[];
      offset?: string;
    };
    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

function normaliseForFigma(str: string): string {
  return str
    .replace(/ä/g, "a")
    .replace(/Ä/g, "A")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "O")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "U")
    .replace(/õ/g, "o")
    .replace(/Õ/g, "O")
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

/** Create banner records in batches of 10 with typecast:true */
async function createBanners(
  records: { fields: Record<string, unknown> }[]
): Promise<number> {
  let count = 0;
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await airtablePost(BANNERS_TABLE, {
      records: batch,
      typecast: true,
    });
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

    // ── Map camelCase client keys to Airtable field names ────────────────────
    if ("copySheetUrl" in body) {
      body["Copy_Sheet_URL"] = body["copySheetUrl"] ?? null;
      delete body["copySheetUrl"];
    }

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

    // ── 2. Only proceed if Field_Config is included ───────────────────────────
    const fieldConfigRaw = body["Field_Config"];
    if (!fieldConfigRaw) {
      // Scenario 10: metadata-only update — no banner creation needed
      return NextResponse.json({ ...patchData, bannersCreated: 0, totalBanners: 0 });
    }

    let fieldConfig: {
      languages?: string[];
      formats?: string[];
      formatConfigs?: Record<
        string,
        {
          variables?: string[];
          mode?: string;
          slideCount?: number;
        }
      >;
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

    // ── 3. Fetch existing banners ─────────────────────────────────────────────
    const existingBanners = await fetchExistingBanners(campaignId);

    /**
     * existingStandardKeys: Set<"FormatName|Language"> — for Standard banners
     * existingCarouselMap:  Map<"FormatName|Language", { id, slideCount }> — for Carousel parents
     * existingSlideMap:     Map<"parentId|slideIndex", recordId> — for Slide records
     */
    const existingStandardKeys = new Set<string>();
    const existingCarouselMap = new Map<
      string,
      { id: string; slideCount: number }
    >();
    const existingSlideMap = new Map<string, string>(); // "parentId|slideIndex" → recordId

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
        existingCarouselMap.set(`${formatName}|${language}`, {
          id: b.id,
          slideCount,
        });
      } else if (bannerType === "Slide") {
        if (parentBanner && parentBanner.length > 0 && slideIndex) {
          existingSlideMap.set(`${parentBanner[0]}|${slideIndex}`, b.id);
        }
      }
    }

    // ── 4. Fetch format records from Formats table ────────────────────────────
    const formatNameFormula =
      formatNames.length === 1
        ? `{Format_Name}="${formatNames[0]}"`
        : `OR(${formatNames.map((n) => `{Format_Name}="${n}"`).join(",")})`;

    const fmtParams = new URLSearchParams();
    fmtParams.set("filterByFormula", formatNameFormula);
    [
      "Format_Name",
      "Width",
      "Height",
      "Channel",
      "Device",
      "Safe_Area",
      "Output_Format",
      "Figma_Frame_Base",
    ].forEach((f) => fmtParams.append("fields[]", f));

    const fmtRes = await airtableFetch(`${FORMATS_TABLE}?${fmtParams.toString()}`);
    const fmtData = fmtRes.ok
      ? ((await fmtRes.json()) as { records: AirtableRecord[] })
      : { records: [] };

    const formatRecordsByName: Record<string, AirtableRecord> = {};
    for (const r of fmtData.records) {
      const name = r.fields["Format_Name"] as string;
      if (name) formatRecordsByName[name] = r;
    }

    // ── 5. Fetch campaign record to get Campaign_Name and Product_Name ─────────
    const campaignRecord = await fetchCampaignById(campaignId);
    const campaignName = campaignRecord?.name ?? "";
    const productName =
      (campaignRecord as { productName?: string })?.productName ?? "";

    // ── 6. Process each format ────────────────────────────────────────────────
    let bannersCreated = 0;
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
        const carouselKey = `${formatName}|${language}`;
        const standardKey = `${formatName}|${language}`;

        if (mode === "carousel") {
          // ── Carousel mode ──────────────────────────────────────────────────
          const existingCarousel = existingCarouselMap.get(carouselKey);

          if (!existingCarousel) {
            // Scenario 3 / Scenario 6 (Standard→Carousel):
            // No carousel parent exists yet — create parent + all slides.
            // Note: existing Standard banner (if any) is left untouched (rule 1).
            const parentRes = await airtablePost(BANNERS_TABLE, {
              records: [
                {
                  fields: {
                    ...baseFields,
                    Language: language,
                    Banner_Type: "Carousel",
                    Slide_Count: targetSlideCount,
                    Banner_Name: generateBannerName(
                      channel,
                      formatName,
                      width,
                      height,
                      productName,
                      language
                    ),
                  },
                },
              ],
              typecast: true,
            });
            const parentId = parentRes.records[0].id;
            bannersCreated += 1;

            // Create all slides
            const slideRecords: { fields: Record<string, unknown> }[] = [];
            for (let s = 0; s < targetSlideCount; s++) {
              slideRecords.push({
                fields: {
                  ...baseFields,
                  Language: language,
                  Figma_Frame: `${figmaFrameBase}_Slide_${s + 1}`,
                  Banner_Type: "Slide",
                  Banner_Name: generateBannerName(
                    channel,
                    formatName,
                    width,
                    height,
                    productName,
                    language,
                    s + 1
                  ),
                  Parent_Banner: [parentId],
                  Slide_Index: s + 1,
                },
              });
            }
            bannersCreated += await createBanners(slideRecords);
          } else {
            // Carousel parent already exists.
            const parentId = existingCarousel.id;
            const existingSlideCount = existingCarousel.slideCount;

            // Scenario 4: Slide count increased → update Slide_Count on parent + create new slides
            // Scenario 5: Slide count decreased → update Slide_Count on parent only (no deletion — rule 1)
            // Scenario 9: No change → update Slide_Count (idempotent)
            if (targetSlideCount !== existingSlideCount) {
              await airtablePatch(
                `${BANNERS_TABLE}/${parentId}`,
                { Slide_Count: targetSlideCount }
              );
            }

            if (targetSlideCount > existingSlideCount) {
              // Create only the NEW slides (indices existingSlideCount+1 … targetSlideCount)
              const newSlideRecords: { fields: Record<string, unknown> }[] = [];
              for (let s = existingSlideCount + 1; s <= targetSlideCount; s++) {
                // Only create if this slide doesn't already exist
                if (!existingSlideMap.has(`${parentId}|${s}`)) {
                  newSlideRecords.push({
                    fields: {
                      ...baseFields,
                      Language: language,
                      Figma_Frame: `${figmaFrameBase}_Slide_${s}`,
                      Banner_Type: "Slide",
                      Banner_Name: generateBannerName(
                        channel,
                        formatName,
                        width,
                        height,
                        productName,
                        language,
                        s
                      ),
                      Parent_Banner: [parentId],
                      Slide_Index: s,
                    },
                  });
                }
              }
              if (newSlideRecords.length > 0) {
                bannersCreated += await createBanners(newSlideRecords);
              }
            }
            // Scenario 5: slides 4-5 are NOT deleted (rule 1). Slide_Count updated above.
          }
        } else {
          // ── Standard mode ──────────────────────────────────────────────────
          // Scenario 7 (Carousel→Standard): existingCarouselMap may have an entry
          // for this format, but we still create a new Standard banner if one
          // doesn't already exist. The old carousel is left untouched (rule 1).
          if (existingStandardKeys.has(standardKey)) continue; // already exists

          newStandardRecords.push({
            fields: {
              ...baseFields,
              Language: language,
              Banner_Type: "Standard",
              Banner_Name: generateBannerName(
                channel,
                formatName,
                width,
                height,
                productName,
                language
              ),
            },
          });
        }
      }
    }

    // Batch-create all standard banners
    if (newStandardRecords.length > 0) {
      bannersCreated += await createBanners(newStandardRecords);
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
