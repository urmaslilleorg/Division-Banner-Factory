export const dynamic = "force-dynamic";
/**
 * POST /api/campaigns/[id]/import/execute
 *
 * Body (multipart form):
 *   file: File (.xlsx/.xls/.csv)
 *   columnMapping: JSON string — { clientColumn: bannerFactoryField }
 *   syncKey: string — the client column used as the unique product identifier
 *
 * Execution:
 *   For each row in the spreadsheet:
 *     a) Look up existing Banner records where Sync_Key = row[syncKey] AND Campaign_Name = campaign
 *     b) If found → PATCH mapped copy fields + Import_Source
 *     c) If not found → create Banner records × all campaign formats
 *     d) Existing banners not in this import → Status = Archived
 *
 *   PATCH Campaign.Last_Import = now()
 *   PATCH Campaign.Column_Mapping = JSON.stringify(columnMapping)
 *
 * Returns: { created, updated, archived, errors }
 */

import { NextRequest, NextResponse } from "next/server";
import { parseSpreadsheet } from "@/lib/spreadsheet-parser";

export const runtime = "nodejs";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";
const FORMATS_TABLE = "tblSIJqlhuJ6QblzW";

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

/** Fetch all records from a table with optional filter formula */
async function fetchAllRecords(
  table: string,
  filterFormula?: string,
  fields?: string[]
): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (filterFormula) params.set("filterByFormula", filterFormula);
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

/** Patch a single record */
async function patchRecord(
  table: string,
  id: string,
  fields: Record<string, unknown>
): Promise<void> {
  await airtableFetch(`${table}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

/** Create records in batches of 10 */
async function createRecords(
  table: string,
  records: { fields: Record<string, unknown> }[]
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await airtableFetch<{ records: AirtableRecord[] }>(table, {
      method: "POST",
      body: JSON.stringify({ records: batch, typecast: true }),
    });
    ids.push(...res.records.map((r) => r.id));
  }
  return ids;
}

/** Patch records in batches of 10 */
async function patchRecords(
  table: string,
  updates: { id: string; fields: Record<string, unknown> }[]
): Promise<void> {
  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10);
    await airtableFetch(table, {
      method: "PATCH",
      body: JSON.stringify({ records: batch }),
    });
  }
}

function normaliseForName(str: string): string {
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
  const productNorm = normaliseForName(productName);
  let name = `${channelNorm}_${formatName}_${width}x${height}_${productNorm}_${language}`;
  if (slideIndex !== undefined) name += `_Slide_${slideIndex}`;
  return name;
}

/** Map a Banner Factory field ID to the Airtable field name for a given language */
const LANGUAGE_SUFFIXED = new Set(["H1", "H2", "H3", "CTA"]);

function fieldToAirtable(fieldId: string, language: string): string {
  if (LANGUAGE_SUFFIXED.has(fieldId)) return `${fieldId}_${language}`;
  return fieldId;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const campaignId = params.id;
  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  let archived = 0;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const columnMappingRaw = formData.get("columnMapping") as string | null;
    const syncKeyColumn = formData.get("syncKey") as string | null;

    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (!columnMappingRaw) return NextResponse.json({ error: "No column mapping" }, { status: 400 });
    if (!syncKeyColumn) return NextResponse.json({ error: "No sync key column" }, { status: 400 });

    // Parse column mapping: { clientColumn → bannerFactoryField }
    const columnMapping: Record<string, string> = JSON.parse(columnMappingRaw);

    // Parse spreadsheet
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseSpreadsheet(buffer, file.type);
    const { rows, sheetName } = parsed;

    // Fetch campaign record to get Field_Config (formats, languages, productName)
    const campaignRecord = await airtableFetch<AirtableRecord>(
      `${CAMPAIGNS_TABLE}/${campaignId}`
    );
    const campaignFields = campaignRecord.fields;
    const campaignName = (campaignFields["Campaign Name"] as string) || "";
    const productName = (campaignFields["Product_Name"] as string) || "";

    let fieldConfig: { languages: string[]; formats: Record<string, { variables: string[]; mode: string; slideCount?: number }> } | null = null;
    try {
      fieldConfig = JSON.parse(campaignFields["Field_Config"] as string);
    } catch {
      return NextResponse.json({ error: "Campaign has no Field_Config" }, { status: 400 });
    }

    const languages: string[] = fieldConfig?.languages ?? ["ET"];
    const formatsConfig = fieldConfig?.formats ?? {};
    const formatIds = Object.keys(formatsConfig);

    if (formatIds.length === 0) {
      return NextResponse.json({ error: "Campaign has no formats configured" }, { status: 400 });
    }

    // Fetch format records
    const formula =
      formatIds.length === 1
        ? `RECORD_ID()="${formatIds[0]}"`
        : `OR(${formatIds.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    const formatRecords = await fetchAllRecords(FORMATS_TABLE, formula);

    // Fetch all existing banner records for this campaign (Standard + Carousel, not Slide)
    const existingBanners = await fetchAllRecords(
      BANNERS_TABLE,
      `AND({Campaign_Name}="${campaignName}",OR({Banner_Type}="Standard",{Banner_Type}="Carousel"))`,
      ["Sync_Key", "Banner_Name", "Status", "Banner_Type", "Language", "Campaign_Name"]
    );

    // Build a map: syncKeyValue → [banner records]
    const existingBySyncKey = new Map<string, AirtableRecord[]>();
    for (const banner of existingBanners) {
      const sk = (banner.fields["Sync_Key"] as string) || "";
      if (sk) {
        if (!existingBySyncKey.has(sk)) existingBySyncKey.set(sk, []);
        existingBySyncKey.get(sk)!.push(banner);
      }
    }

    // Track which sync keys appear in this import
    const importedSyncKeys = new Set<string>();

    // Process each row
    for (const row of rows) {
      const syncKeyValue = row[syncKeyColumn]?.trim();
      if (!syncKeyValue) continue;

      importedSyncKeys.add(syncKeyValue);

      // Build mapped copy values: { bannerFactoryField → value }
      const mappedValues: Record<string, string> = {};
      for (const [clientCol, bfField] of Object.entries(columnMapping)) {
        if (bfField === "ignore" || bfField === "Sync key") continue;
        const val = row[clientCol]?.trim();
        if (val) mappedValues[bfField] = val;
      }

      const importSource = sheetName;

      if (existingBySyncKey.has(syncKeyValue)) {
        // UPDATE existing records
        const bannerRecords = existingBySyncKey.get(syncKeyValue)!;
        const updates: { id: string; fields: Record<string, unknown> }[] = [];

        for (const banner of bannerRecords) {
          const language = (banner.fields["Language"] as string) || languages[0];
          const fields: Record<string, unknown> = { Import_Source: importSource };

          for (const [bfField, val] of Object.entries(mappedValues)) {
            if (!val) continue;
            const airtableField = fieldToAirtable(bfField, language);
            fields[airtableField] = val;
          }

          // Handle Promo_Flag
          const promoCol = Object.entries(columnMapping).find(([, v]) => v === "Promo_Flag")?.[0];
          if (promoCol) {
            const promoVal = row[promoCol]?.trim().toLowerCase();
            fields["Promo_Flag"] = promoVal === "jah" || promoVal === "yes" || promoVal === "true" || promoVal === "1";
          }

          updates.push({ id: banner.id, fields });
        }

        if (updates.length > 0) {
          await patchRecords(BANNERS_TABLE, updates);
          updated++;
        }
      } else {
        // CREATE new banner records × all formats × all languages
        const newRecords: { fields: Record<string, unknown> }[] = [];

        for (const formatRecord of formatRecords) {
          const fFields = formatRecord.fields;
          const formatName = (fFields["Format_Name"] as string) || "";
          const channel = (fFields["Channel"] as string) || "Web";
          const device = (fFields["Device"] as string) || "Desktop";
          const width = (fFields["Width"] as number) || 0;
          const height = (fFields["Height"] as number) || 0;
          const outputFormat = (fFields["Output_Format"] as string) || "PNG";
          const safeArea = (fFields["Safe_Area"] as string) || "";
          const figmaFrameBase = (fFields["Figma_Frame_Base"] as string) || "";

          const formatConf = formatsConfig[formatRecord.id] ?? { variables: [], mode: "default" };
          const variables: string[] = formatConf.variables ?? [];

          for (const language of languages) {
            const copyFields: Record<string, unknown> = {};
            for (const [bfField, val] of Object.entries(mappedValues)) {
              if (!val || !variables.includes(bfField)) continue;
              const airtableField = fieldToAirtable(bfField, language);
              copyFields[airtableField] = val;
            }

            // Handle Promo_Flag
            const promoCol = Object.entries(columnMapping).find(([, v]) => v === "Promo_Flag")?.[0];
            if (promoCol) {
              const promoVal = row[promoCol]?.trim().toLowerCase();
              copyFields["Promo_Flag"] = promoVal === "jah" || promoVal === "yes" || promoVal === "true" || promoVal === "1";
            }

            const figmaFrame = figmaFrameBase ||
              `_MASTER_${channel.replace(/[/\s]+/g, "")}_${formatName}_${width}x${height}`;

            newRecords.push({
              fields: {
                Campaign_Name: campaignName,
                "Campaign Link": [campaignId],
                Channel: channel,
                Device: device,
                Format: `${width}x${height}`,
                Figma_Frame: figmaFrame,
                Safe_Area: safeArea,
                Output_Format: outputFormat,
                Status: "Brief_received",
                Approval_Status: "Pending",
                Language: language,
                Banner_Type: "Standard",
                Sync_Key: syncKeyValue,
                Import_Source: importSource,
                Banner_Name: generateBannerName(channel, formatName, width, height, productName || syncKeyValue, language),
                ...copyFields,
              },
            });
          }
        }

        if (newRecords.length > 0) {
          await createRecords(BANNERS_TABLE, newRecords);
          created++;
        }
      }
    }

    // Archive banners whose sync key is no longer in the import
    const toArchive: { id: string; fields: Record<string, unknown> }[] = [];
    for (const [sk, banners] of Array.from(existingBySyncKey.entries())) {
      if (!importedSyncKeys.has(sk)) {
        for (const banner of banners) {
          if ((banner.fields["Status"] as string) !== "Archived") {
            toArchive.push({ id: banner.id, fields: { Status: "Archived" } });
          }
        }
      }
    }
    if (toArchive.length > 0) {
      await patchRecords(BANNERS_TABLE, toArchive);
      archived = toArchive.length;
    }

    // Update campaign: Last_Import + Column_Mapping
    await patchRecord(CAMPAIGNS_TABLE, campaignId, {
      Last_Import: new Date().toISOString(),
      Column_Mapping: columnMappingRaw,
    });

    return NextResponse.json({ created, updated, archived, errors });
  } catch (err) {
    console.error("[import/execute] error:", err);
    return NextResponse.json(
      { error: "Import failed", details: String(err), created, updated, archived, errors },
      { status: 500 }
    );
  }
}
