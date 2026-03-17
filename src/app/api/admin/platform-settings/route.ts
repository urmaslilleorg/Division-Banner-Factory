/**
 * GET  /api/admin/platform-settings
 *   Returns the platform config object from Registry_JSON (keys: languages,
 *   emailNotificationRules, branding) plus live Airtable counts.
 *
 * PATCH /api/admin/platform-settings
 *   Merges the supplied partial config into Registry_JSON and saves.
 *
 * division_admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/get-user";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BRAND_ASSETS_TABLE = "tblXAWuxJ47Bejj5w";
const REGISTRY_RECORD_ID = "recCjnJ8I3v3STPfW";

// Table IDs for live counts
const CLIENTS_TABLE = "tblE3eM8D5vlRs6Qq";
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";
const USERS_TABLE = "tbleVZb81haFVWqor";

async function airtableFetch(path: string, options?: RequestInit) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return res.json();
}

async function countRecords(tableId: string, filterFormula?: string): Promise<number> {
  const params = new URLSearchParams({ "fields[]": "Name", pageSize: "1" });
  if (filterFormula) params.set("filterByFormula", filterFormula);
  // Airtable doesn't have a count endpoint — we fetch with pageSize=1 and
  // follow offset pagination just to get the total. Instead, fetch all IDs.
  let count = 0;
  let offset: string | undefined;
  do {
    const p = new URLSearchParams({ "fields[]": "Name" });
    if (filterFormula) p.set("filterByFormula", filterFormula);
    if (offset) p.set("offset", offset);
    const data = await airtableFetch(`${tableId}?${p.toString()}`);
    count += (data.records as unknown[]).length;
    offset = data.offset;
  } while (offset);
  return count;
}

async function getRegistryRecord() {
  return airtableFetch(`${BRAND_ASSETS_TABLE}/${REGISTRY_RECORD_ID}`);
}

function parsePlatformConfig(registryJson: string) {
  try {
    const parsed = JSON.parse(registryJson);
    // Registry_JSON may be an array (variables) or an object (new format)
    if (Array.isArray(parsed)) {
      return { variables: parsed };
    }
    return parsed;
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const user = getUser(req.headers);
  if (!user || user.role !== "division_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [record, activeClients, totalCampaigns, totalBanners, activeUsers] =
      await Promise.all([
        getRegistryRecord(),
        countRecords(CLIENTS_TABLE, `NOT({Status}="Archived")`),
        countRecords(CAMPAIGNS_TABLE),
        countRecords(BANNERS_TABLE),
        countRecords(USERS_TABLE, `{Status}="Active"`),
      ]);

    const registryJson: string = record.fields?.Registry_JSON ?? "[]";
    const config = parsePlatformConfig(registryJson);

    return NextResponse.json({
      config: {
        languages: config.languages ?? null,
        emailNotificationRules: config.emailNotificationRules ?? null,
        branding: config.branding ?? null,
      },
      counts: {
        activeClients,
        totalCampaigns,
        totalBanners,
        activeUsers,
      },
      integrations: {
        airtable: !!process.env.AIRTABLE_API_KEY,
        vercelBlob: !!process.env.BLOB_READ_WRITE_TOKEN,
        figma: !!process.env.FIGMA_ACCESS_TOKEN,
        resend: !!process.env.RESEND_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
      },
      email: {
        fromAddress: process.env.RESEND_FROM_EMAIL ?? null,
      },
    });
  } catch (err) {
    console.error("[platform-settings GET]", err);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = getUser(req.headers);
  if (!user || user.role !== "division_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    // body may contain: { languages?, emailNotificationRules?, branding? }

    const record = await getRegistryRecord();
    const registryJson: string = record.fields?.Registry_JSON ?? "[]";
    const existing = parsePlatformConfig(registryJson);

    // Preserve the variables array if present
    const variables = existing.variables ?? (Array.isArray(existing) ? existing : []);
    const updated = {
      variables,
      languages: body.languages ?? existing.languages,
      emailNotificationRules:
        body.emailNotificationRules ?? existing.emailNotificationRules,
      branding: body.branding ?? existing.branding,
    };

    await airtableFetch(`${BRAND_ASSETS_TABLE}/${REGISTRY_RECORD_ID}`, {
      method: "PATCH",
      body: JSON.stringify({
        fields: { Registry_JSON: JSON.stringify(updated, null, 2) },
      }),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[platform-settings PATCH]", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
