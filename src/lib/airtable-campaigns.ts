/**
 * Airtable campaign + format data layer — server-side only.
 * Never import from client components.
 */

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const AIRTABLE_BASE_URL = "https://api.airtable.com/v0";
const BASE_ID = "appIqinespXjbIERp";
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";
const FORMATS_TABLE = "tblSIJqlhuJ6QblzW";

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

async function airtableRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${AIRTABLE_BASE_URL}/${BASE_ID}/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Airtable API error ${response.status}: ${errorBody}`);
  }
  return response.json() as Promise<T>;
}

export interface Campaign {
  id: string;
  name: string;
  clientName: string;
  active: boolean;
  launchMonth: string; // e.g. "March 2026"
  startDate: string;
  endDate: string;
  fieldConfig: FieldConfig | null;
  bannerIds: string[];
}

export interface FieldConfig {
  variables: string[];
  languages: string[];
  formats: string[];
}

export interface AirtableFormat {
  id: string;
  formatName: string;
  widthPx: number;
  heightPx: number;
  channel: string;
  device: string;
  figmaFrameBase: string;
  safeArea: string;
  outputFormat: string;
  active: boolean;
}

export interface BannerSummary {
  id: string;
  campaignName: string;
  approvalStatus: string | null;
  status: string;
}

function parseCampaign(record: AirtableRecord): Campaign {
  const f = record.fields;
  let fieldConfig: FieldConfig | null = null;
  if (f["Field_Config"]) {
    try {
      fieldConfig = JSON.parse(f["Field_Config"] as string);
    } catch {
      fieldConfig = null;
    }
  }
  return {
    id: record.id,
    name: (f["Campaign Name"] as string) || "",
    clientName: (f["Client_Name"] as string) || "",
    active: (f["Active"] as boolean) || false,
    launchMonth: (f["Launch_Month"] as string) || "",
    startDate: (f["Start Date"] as string) || (f["Start_Date"] as string) || "",
    endDate: (f["End Date"] as string) || (f["End_Date"] as string) || "",
    fieldConfig,
    bannerIds: (f["Banners"] as string[]) || [],
  };
}

/**
 * Fetch all campaigns (no filter).
 */
export async function fetchAllCampaigns(): Promise<Campaign[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const res = await airtableRequest<{ records: AirtableRecord[]; offset?: string }>(
      `${CAMPAIGNS_TABLE}?${params}`
    );
    records.push(...res.records);
    offset = res.offset;
  } while (offset);
  return records.map(parseCampaign);
}

/**
 * Fetch a single campaign by record ID.
 */
export async function fetchCampaignById(recordId: string): Promise<Campaign> {
  const record = await airtableRequest<AirtableRecord>(
    `${CAMPAIGNS_TABLE}/${recordId}`
  );
  return parseCampaign(record);
}

/**
 * Fetch all banner summaries (id, campaignName, approvalStatus, status).
 * Used for home page progress calculations.
 */
export async function fetchBannerSummaries(): Promise<BannerSummary[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    params.append("fields[]", "Campaign Name");
    params.append("fields[]", "Approval_Status");
    params.append("fields[]", "Status");
    if (offset) params.set("offset", offset);
    const res = await airtableRequest<{ records: AirtableRecord[]; offset?: string }>(
      `${BANNERS_TABLE}?${params}`
    );
    records.push(...res.records);
    offset = res.offset;
  } while (offset);
  return records.map((r) => ({
    id: r.id,
    campaignName: (r.fields["Campaign Name"] as string) || "",
    approvalStatus: (r.fields["Approval_Status"] as string) || null,
    status: (r.fields["Status"] as string) || "Draft",
  }));
}

/**
 * Fetch all formats from the Formats table.
 */
export async function fetchFormats(): Promise<AirtableFormat[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const res = await airtableRequest<{ records: AirtableRecord[]; offset?: string }>(
      `${FORMATS_TABLE}?${params}`
    );
    records.push(...res.records);
    offset = res.offset;
  } while (offset);
  return records.map((r) => ({
    id: r.id,
    formatName: (r.fields["Format_Name"] as string) || "",
    widthPx: (r.fields["Width_px"] as number) || 0,
    heightPx: (r.fields["Height_px"] as number) || 0,
    channel: (r.fields["Channel"] as string) || "Web",
    device: (r.fields["Device"] as string) || "Desktop",
    figmaFrameBase: (r.fields["Figma_Frame_Base"] as string) || "",
    safeArea: (r.fields["Safe_Area"] as string) || "",
    outputFormat: (r.fields["Output_Format"] as string) || "PNG",
    active: (r.fields["Active"] as boolean) || false,
  }));
}

/**
 * Create a Campaign record and return its ID.
 */
export async function createCampaignRecord(fields: Record<string, unknown>): Promise<string> {
  const res = await airtableRequest<AirtableRecord>(CAMPAIGNS_TABLE, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  return res.id;
}

/**
 * Create multiple Banner records in batches of 10.
 */
export async function createBannerRecords(
  records: { fields: Record<string, unknown> }[]
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await airtableRequest<{ records: AirtableRecord[] }>(BANNERS_TABLE, {
      method: "POST",
      body: JSON.stringify({ records: batch }),
    });
    ids.push(...res.records.map((r) => r.id));
  }
  return ids;
}

/**
 * Delete Banner records by ID in batches of 10.
 */
export async function deleteBannerRecords(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    const params = batch.map((id) => `records[]=${id}`).join("&");
    await airtableRequest(`${BANNERS_TABLE}?${params}`, { method: "DELETE" });
  }
}

/**
 * Delete a Campaign record by ID.
 */
export async function deleteCampaignRecord(id: string): Promise<void> {
  await airtableRequest(`${CAMPAIGNS_TABLE}/${id}`, { method: "DELETE" });
}
