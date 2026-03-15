import { getUserRole } from "@/lib/auth-role";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import type { CampaignTemplate } from "../route";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const CLIENTS_TABLE = "tblE3eM8D5vlRs6Qq";

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
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
 * DELETE /api/clients/[clientId]/templates/[templateId]
 * Removes a template by ID. Requires division_admin role.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { clientId: string; templateId: string } }
) {
  const userId = "mock-user-id";
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getUserRole();
  if (role !== "division_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const record = await getClientRecord(params.clientId);
  if (!record) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const templates = parseTemplates(record.fields["Client_Templates"]);
  const filtered = templates.filter((t) => t.id !== params.templateId);

  if (filtered.length === templates.length) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Patch back
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${record.id}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: { Client_Templates: JSON.stringify(filtered) } }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Airtable error: ${err}` }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
