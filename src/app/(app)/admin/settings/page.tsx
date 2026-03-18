import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { fetchFormats } from "@/lib/airtable-campaigns";
import { fetchAllClients } from "@/lib/airtable-clients";
import { getUser } from "@/lib/get-user";
import PlatformSettingsTabs from "@/components/admin/platform-settings-tabs";

export const dynamic = "force-dynamic";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BRAND_ASSETS_TABLE = "tblXAWuxJ47Bejj5w";
const REGISTRY_RECORD_ID = "recCjnJ8I3v3STPfW";
const CLIENTS_TABLE = "tblE3eM8D5vlRs6Qq";
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";
const USERS_TABLE = "tbleVZb81haFVWqor";

async function airtableFetch(path: string) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}`);
  return res.json();
}

// Table primary field names — used so we only fetch one lightweight field per record
const TABLE_PRIMARY: Record<string, string> = {
  [CLIENTS_TABLE]: "Client_Name",
  [CAMPAIGNS_TABLE]: "Campaign Name",
  [BANNERS_TABLE]: "Banner_ID",
  [USERS_TABLE]: "Email",
};

async function countRecords(tableId: string, filterFormula?: string): Promise<number> {
  try {
    let count = 0;
    let offset: string | undefined;
    const primaryField = TABLE_PRIMARY[tableId] ?? "Name";
    do {
      const p = new URLSearchParams({ "fields[]": primaryField });
      if (filterFormula) p.set("filterByFormula", filterFormula);
      if (offset) p.set("offset", offset);
      const data = await airtableFetch(`${tableId}?${p.toString()}`);
      count += (data.records as unknown[]).length;
      offset = data.offset;
    } while (offset);
    return count;
  } catch {
    return 0;
  }
}

function parsePlatformConfig(registryJson: string) {
  try {
    const parsed = JSON.parse(registryJson);
    if (Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

export default async function PlatformSettingsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const hdrs = await headers();
  const user = getUser(hdrs);
  if (!user || user.role !== "division_admin") {
    redirect("/admin");
  }

  const [record, activeClients, totalCampaigns, totalBanners, activeUsers, formats, clients] =
    await Promise.all([
      airtableFetch(`${BRAND_ASSETS_TABLE}/${REGISTRY_RECORD_ID}`),
      countRecords(CLIENTS_TABLE, `NOT({Status}="Archived")`),
      countRecords(CAMPAIGNS_TABLE),
      countRecords(BANNERS_TABLE),
      countRecords(USERS_TABLE, `{Status}="Active"`),
      fetchFormats(),
      fetchAllClients(),
    ]);

  const registryJson: string = record.fields?.Registry_JSON ?? "[]";
  const config = parsePlatformConfig(registryJson);

  // Build formats data for the Formats tab
  const usedByMap: Record<string, string[]> = {};
  for (const client of clients) {
    for (const fid of client.formatIds) {
      if (!usedByMap[fid]) usedByMap[fid] = [];
      usedByMap[fid].push(client.name);
    }
  }
  const formatsData = formats.map((f) => ({
    id: f.id,
    formatName: f.formatName,
    channel: f.channel,
    device: f.device,
    width: f.widthPx,
    height: f.heightPx,
    safeArea: f.safeArea ?? "",
    outputFormat: f.outputFormat ?? "",
    figmaFrameBase: f.figmaFrameBase ?? "",
    nexdTemplateId: f.nexdTemplateId ?? "",
    usedBy: usedByMap[f.id] || [],
  }));

  // Read plugin version from manifest
  let pluginVersion = "unknown";
  let pluginUpdated = "unknown";
  try {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const manifestPath = join(process.cwd(), "figma-plugin", "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    pluginVersion = manifest.version ?? "v23";
    pluginUpdated = manifest.updatedAt ?? "16 March 2026";
  } catch {
    pluginVersion = "v23";
    pluginUpdated = "16 March 2026";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Platform Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Global configuration that applies across all clients.
        </p>
      </div>
      <PlatformSettingsTabs
        initialTab={searchParams.tab ?? "general"}
        counts={{ activeClients, totalCampaigns, totalBanners, activeUsers }}
        config={config}
        integrations={{
          airtable: !!process.env.AIRTABLE_API_KEY,
          vercelBlob: !!process.env.BLOB_READ_WRITE_TOKEN,
          figma: !!process.env.FIGMA_ACCESS_TOKEN,
          resend: !!process.env.RESEND_API_KEY,
          anthropic: !!process.env.ANTHROPIC_API_KEY,
        }}
        email={{
          fromAddress: process.env.RESEND_FROM_EMAIL ?? null,
        }}
        formatsData={formatsData}
        pluginVersion={pluginVersion}
        pluginUpdated={pluginUpdated}
        appDomain={process.env.NEXT_PUBLIC_APP_DOMAIN ?? "menteproduction.com"}
      />
    </div>
  );
}
