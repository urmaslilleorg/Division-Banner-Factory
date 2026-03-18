/**
 * Airtable Clients data layer — server-side only.
 * Reads from the Clients table (tblE3eM8D5vlRs6Qq).
 * Never import from client components.
 */
import type { ClientVariable } from "@/lib/types";
import type { CampaignTemplate } from "@/app/api/clients/[clientId]/templates/route";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const CLIENTS_TABLE = "tblE3eM8D5vlRs6Qq";

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

async function airtableGet<T>(path: string): Promise<T> {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** A format template — defines variable slots+labels for a set of formats. */
export interface FormatTemplate {
  id: string;
  name: string;
  /** "still" = static banner, "video" = animated export */
  type: "still" | "video";
  createdAt: string;
  /** Airtable format IDs this template applies to */
  formatIds: string[];
  /** Variable slots with per-template labels */
  variables: { slot: string; label: string }[];
  /** Optional reference to a VideoTemplate id (video type only) */
  animationTemplateId?: string;
}

export interface ClientRecord {
  id: string;
  name: string;
  subdomain: string;
  status: "Draft" | "Active" | "Archived";
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  languages: string[];
  campaignFilter: string;
  formatIds: string[];
  figmaAssetFile: string;
  logoUrl: string;
  notes: string;
  /** Parsed Client_Variables JSON — empty array if not set */
  clientVariables: ClientVariable[];
  /** Parsed Client_Templates JSON — empty array if not set */
  clientTemplates: CampaignTemplate[];
  /** Parsed Video_Templates JSON — empty array if not set */
  videoTemplates: Array<{ id: string; name: string; duration: number; fps?: number; description?: string; keyframes?: unknown[] }>;
  /** Parsed Format_Templates JSON — empty array if not set */
  formatTemplates: FormatTemplate[];
}

/**
 * Safely parse the Client_Variables JSON string from Airtable.
 * Returns an empty array on any parse error.
 */
function parseClientVariables(raw: string | undefined): ClientVariable[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is ClientVariable =>
        typeof v === "object" && v !== null &&
        typeof v.slot === "string" && typeof v.label === "string"
    );
  } catch {
    return [];
  }
}

type VideoTemplate = { id: string; name: string; duration: number; fps?: number; description?: string; keyframes?: unknown[] };

function parseVideoTemplates(raw: string | undefined): VideoTemplate[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as VideoTemplate[];
  } catch {
    return [];
  }
}

function parseClientTemplates(raw: string | undefined): CampaignTemplate[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CampaignTemplate[];
  } catch {
    return [];
  }
}

function parseFormatTemplates(raw: string | undefined): FormatTemplate[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as FormatTemplate[];
  } catch {
    return [];
  }
}

function parseClientRecord(record: AirtableRecord): ClientRecord {
  const f = record.fields;
  return {
    id: record.id,
    name: (f["Client_Name"] as string) || "",
    subdomain: (f["Subdomain"] as string) || "",
    status: ((f["Status"] as string) || "Draft") as ClientRecord["status"],
    primaryColor: (f["Primary_Color"] as string) || "#000000",
    secondaryColor: (f["Secondary_Color"] as string) || "#000000",
    accentColor: (f["Accent_Color"] as string) || "#000000",
    backgroundColor: (f["Background_Color"] as string) || "#ffffff",
    languages: (f["Languages"] as string[]) || [],
    campaignFilter: (f["Campaign_Filter"] as string) || "",
    formatIds: (f["Formats"] as string[]) || [],
    figmaAssetFile: (f["Figma_Asset_File"] as string) || "",
    logoUrl: (f["Logo_URL"] as string) || "",
    notes: (f["Notes"] as string) || "",
    clientVariables: parseClientVariables(f["Client_Variables"] as string | undefined),
    clientTemplates: parseClientTemplates(f["Client_Templates"] as string | undefined),
    videoTemplates: parseVideoTemplates(f["Video_Templates"] as string | undefined),
    formatTemplates: parseFormatTemplates(f["Format_Templates"] as string | undefined),
  };
}

/**
 * Fetch all non-archived clients.
 */
export async function fetchAllClients(): Promise<ClientRecord[]> {
  const params = new URLSearchParams();
  params.set("filterByFormula", `NOT({Status}="Archived")`);
  params.set("sort[0][field]", "Client_Name");
  params.set("sort[0][direction]", "asc");

  const data = await airtableGet<{ records: AirtableRecord[] }>(
    `${CLIENTS_TABLE}?${params.toString()}`
  );
  return data.records.map(parseClientRecord);
}

/**
 * Fetch a single client by subdomain.
 */
export async function fetchClientBySubdomain(
  subdomain: string
): Promise<ClientRecord | null> {
  const params = new URLSearchParams();
  params.set("filterByFormula", `{Subdomain}="${subdomain}"`);
  params.set("maxRecords", "1");

  const data = await airtableGet<{ records: AirtableRecord[] }>(
    `${CLIENTS_TABLE}?${params.toString()}`
  );
  if (!data.records.length) return null;
  return parseClientRecord(data.records[0]);
}

/**
 * Fetch a single client by Airtable record ID.
 */
export async function fetchClientById(id: string): Promise<ClientRecord | null> {
  try {
    const record = await airtableGet<AirtableRecord>(`${CLIENTS_TABLE}/${id}`);
    return parseClientRecord(record);
  } catch {
    return null;
  }
}

/**
 * Convert a ClientRecord to the legacy ClientConfig shape used by middleware
 * and client-facing pages. Falls back to static config values where needed.
 */
export function clientRecordToConfig(client: ClientRecord) {
  return {
    id: client.subdomain || client.id,
    name: client.name,
    subdomain: client.subdomain,
    logo: client.logoUrl || `/logos/${client.subdomain}.svg`,
    colors: {
      primary: client.primaryColor || "#1A1A2E",
      secondary: client.secondaryColor || "#16213E",
      accent: client.accentColor || "#0F3460",
      background: client.backgroundColor || "#ffffff",
    },
    languages: client.languages.length ? client.languages : ["ET"],
    airtable: {
      baseId: "appIqinespXjbIERp",
      campaignFilter: client.campaignFilter || client.name,
    },
    features: {
      download: true,
      comments: true,
      approvals: true,
      copyEditor: true,
      designerView: true,
      campaignBuilder: true,
    },
  };
}
