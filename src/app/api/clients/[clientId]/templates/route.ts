export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const CLIENTS_TABLE = "tblE3eM8D5vlRs6Qq";

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

export interface CampaignTemplate {
  id: string;
  name: string;
  createdAt: string;
  fieldConfig: {
    languages: string[];
    formats: Record<string, unknown>;
    formatConfigs?: Record<string, unknown>;
  };
  columnMapping: Record<string, string> | null;
}

async function getClientRecord(subdomain: string): Promise<AirtableRecord | null> {
  const params = new URLSearchParams();
  params.set("filterByFormula", `{Subdomain}="${subdomain}"`);
  params.set("maxRecords", "1");
  params.append("fields[]", "Client_Templates");

  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, cache: "no-store" }
  );
  if (!res.ok) return null;
  const data = await res.json() as { records: AirtableRecord[] };
  return data.records[0] ?? null;
}

async function patchClientTemplates(
  recordId: string,
  templates: CampaignTemplate[]
): Promise<void> {
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${recordId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: { Client_Templates: JSON.stringify(templates) } }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Airtable PATCH error ${res.status}: ${err}`);
  }
}

function parseTemplates(raw: unknown): CampaignTemplate[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CampaignTemplate[];
  } catch {
    return [];
  }
}

/**
 * GET /api/clients/[clientId]/templates
 * Returns the Client_Templates JSON array for the given client subdomain.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const userId = "mock-user-id";
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const record = await getClientRecord(params.clientId);
  if (!record) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const templates = parseTemplates(record.fields["Client_Templates"]);
  return NextResponse.json({ templates });
}

/**
 * POST /api/clients/[clientId]/templates
 * Appends a new template to the client's Client_Templates array.
 * Body: { name, fieldConfig, columnMapping }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { clientId: string } }
) {
  const userId = "mock-user-id";
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    name?: string;
    fieldConfig?: CampaignTemplate["fieldConfig"];
    columnMapping?: Record<string, string> | null;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.fieldConfig) {
    return NextResponse.json({ error: "fieldConfig is required" }, { status: 400 });
  }

  const record = await getClientRecord(params.clientId);
  if (!record) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const templates = parseTemplates(record.fields["Client_Templates"]);

  const newTemplate: CampaignTemplate = {
    id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: body.name.trim(),
    createdAt: new Date().toISOString().split("T")[0],
    fieldConfig: body.fieldConfig,
    columnMapping: body.columnMapping ?? null,
  };

  templates.push(newTemplate);
  await patchClientTemplates(record.id, templates);

  return NextResponse.json({ id: newTemplate.id, name: newTemplate.name });
}
