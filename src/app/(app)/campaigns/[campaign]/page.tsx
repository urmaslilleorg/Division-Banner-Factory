import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { fetchBanners } from "@/lib/airtable";
import { fetchAllCampaigns, FieldConfig } from "@/lib/airtable-campaigns";
import { fetchClientBySubdomain } from "@/lib/airtable-clients";
import CampaignDetailTabs from "@/components/campaign-detail-tabs";
import { FigmaIntegrationPanel } from "@/components/figma-integration-panel";

/** Parse "March 2026" → "/2026/3?preview=true" */
function launchMonthToUrl(launchMonth: string | null): string {
  if (!launchMonth) return "/campaigns?preview=true";
  const months: Record<string, number> = {
    January: 1, February: 2, March: 3, April: 4,
    May: 5, June: 6, July: 7, August: 8,
    September: 9, October: 10, November: 11, December: 12,
  };
  const [monthName, yearStr] = launchMonth.split(" ");
  const month = months[monthName];
  const year = parseInt(yearStr, 10);
  if (!month || isNaN(year)) return "/campaigns?preview=true";
  return `/${year}/${month}?preview=true`;
}

/**
 * Normalise a FieldConfig that may come from the old builder schema
 * (formats as an object keyed by formatName, no top-level variables array)
 * into the canonical shape expected by CampaignDetailTabs / CopyEditorTable.
 */
function normaliseFieldConfig(raw: FieldConfig | null, fallbackLanguages: string[]): FieldConfig {
  if (!raw) {
    return {
      variables: ["H1", "H2", "CTA"],
      languages: fallbackLanguages,
      formats: [],
    };
  }

  // Derive top-level variables from per-format configs when missing
  let variables = raw.variables ?? [];
  if (variables.length === 0) {
    const varSet = new Set<string>();
    // New schema: formatConfigs keyed by formatName
    if (raw.formatConfigs) {
      for (const cfg of Object.values(raw.formatConfigs)) {
        (cfg.variables ?? []).forEach((v) => varSet.add(v));
      }
    }
    // Old schema: formats is an object keyed by formatName
    const formatsVal = raw.formats as unknown;
    if (formatsVal && typeof formatsVal === "object" && !Array.isArray(formatsVal)) {
      for (const cfg of Object.values(formatsVal as Record<string, { variables?: string[] }>)) {
        (cfg.variables ?? []).forEach((v) => varSet.add(v));
      }
    }
    variables = varSet.size > 0 ? Array.from(varSet) : ["H1", "H2", "CTA"];
  }

  // Normalise formats to string[] (old schema stores it as an object)
  const formatsRaw = raw.formats as unknown;
  const formats: string[] = Array.isArray(formatsRaw)
    ? formatsRaw
    : formatsRaw && typeof formatsRaw === "object"
    ? Object.keys(formatsRaw as object)
    : [];

  // Promote old-schema formats object into formatConfigs
  const formatConfigs: FieldConfig["formatConfigs"] =
    raw.formatConfigs ??
    (formatsRaw && typeof formatsRaw === "object" && !Array.isArray(formatsRaw)
      ? (formatsRaw as FieldConfig["formatConfigs"])
      : undefined);

  return {
    ...raw,
    variables,
    formats,
    formatConfigs,
    languages: raw.languages?.length ? raw.languages : fallbackLanguages,
  };
}

/**
 * Count how many format × language combinations are missing banner records.
 * Returns { missingCount, totalConfigured }.
 */
function countMissingBanners(
  resolvedFieldConfig: FieldConfig,
  banners: import("@/lib/types").Banner[]
): { missingCount: number; totalConfigured: number } {
  const { formats = [], languages = [], formatConfigs = {} } = resolvedFieldConfig;
  let totalConfigured = 0;
  let missingCount = 0;

  for (const formatName of formats) {
    const cfg = formatConfigs[formatName] ?? {};
    const mode = (cfg.mode as string) ?? "default";

    for (const language of languages) {
      totalConfigured++;
      if (mode === "carousel") {
        const hasParent = banners.some(
          (b) =>
            (b.format === formatName || `${b.width}x${b.height}` === formatName) &&
            b.language === language &&
            b.bannerType === "Carousel"
        );
        if (!hasParent) missingCount++;
      } else {
        const hasStandard = banners.some(
          (b) =>
            (b.format === formatName || `${b.width}x${b.height}` === formatName) &&
            b.language === language &&
            b.bannerType === "Standard"
        );
        if (!hasStandard) missingCount++;
      }
    }
  }

  return { missingCount, totalConfigured };
}

interface CampaignPageProps {
  params: { campaign: string };
  searchParams?: { tab?: string };
}

export default async function CampaignPage({ params, searchParams }: CampaignPageProps) {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  const clientConfig = getClientConfigFromHeaders();

  // Decode campaign identifier from URL
  const campaignSlug = decodeURIComponent(params.campaign);
  const isRecordId = campaignSlug.startsWith("rec");

  let campaignId: string | null = null;
  let campaignName = campaignSlug;
  let launchMonth: string | null = null;
  let fieldConfig: FieldConfig | null = null;
  let copySheetUrl: string | null = null;
  let figmaCampaignFile: string | null = null;
  let lastFigmaSync: string | null = null;
  let campaignFound = false;

  // Try to find campaign record to get ID and metadata
  try {
    const campaigns = await fetchAllCampaigns();
    // formattedName: "audit-standard" → "Audit Standard" (hyphen-separated words)
    const formattedName = campaignSlug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    const found = isRecordId
      ? campaigns.find((c) => c.id === campaignSlug)
      : // 1. Exact formatted-name match
        campaigns.find((c) => c.name === formattedName) ||
        // 2. Exact slug match (handles names like "Avene_Sprin2026" with no spaces)
        campaigns.find((c) => c.name === campaignSlug) ||
        // 3. Case-insensitive slug match (handles "avene_sprin2026" → "Avene_Sprin2026")
        campaigns.find((c) => c.name.toLowerCase() === campaignSlug.toLowerCase()) ||
        // 4. Slug-from-name match: convert stored name to slug and compare
        campaigns.find(
          (c) =>
            c.name.toLowerCase().replace(/\s+/g, "-") === campaignSlug.toLowerCase()
        );
    if (found) {
      campaignFound = true;
      campaignId = found.id;
      campaignName = found.name;
      launchMonth = found.launchMonth ?? null;
      fieldConfig = found.fieldConfig;
      copySheetUrl = found.copySheetUrl ?? null;
      figmaCampaignFile = found.figmaCampaignFile ?? null;
      lastFigmaSync = found.lastFigmaSync ?? null;
    } else if (!isRecordId) {
      campaignName = formattedName;
    }
  } catch {
    if (!isRecordId) {
      campaignName = campaignSlug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }

  // ── Not found: show a graceful message instead of crashing ──────────────────
  if (!campaignFound && !isRecordId) {
    return (
      <div className="space-y-6">
        <Link
          href="/campaigns?preview=true"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          ← Back to Calendar
        </Link>
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center">
          <h1 className="text-xl font-light text-gray-700 mb-2">Campaign not found</h1>
          <p className="text-sm text-gray-400 mb-6">
            No campaign matches <span className="font-mono text-gray-500">{campaignSlug}</span>.
            It may have been renamed or deleted.
          </p>
          <Link
            href="/campaigns?preview=true"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            Go to Campaign Calendar
          </Link>
        </div>
      </div>
    );
  }

  // Derive user role from Clerk session claims
  // Check both metadata and publicMetadata (Clerk stores role in publicMetadata by default)
  const role =
    ((sessionClaims?.metadata as Record<string, unknown> | undefined)?.role as string | undefined) ??
    ((sessionClaims?.publicMetadata as Record<string, unknown> | undefined)?.role as string | undefined);
  const userRole = role ?? "division_admin";

  // Fetch banners and client variables in parallel
  const clientSubdomain = clientConfig.subdomain || clientConfig.id;
  let banners;
  let clientVariables: import("@/lib/types").ClientVariable[] = [];
  let clientFormatIds: string[] = [];
  let clientFigmaAssetFile = "";
  let clientVideoTemplates: Array<{ id: string; name: string; duration: number }> = [];

  try {
    const [fetchedBanners, clientRecord] = await Promise.all([
      fetchBanners(
        clientConfig.airtable.baseId,
        campaignName,
        clientConfig.languages,
        true // include Slide records for carousel grouping
      ).then(async (result) => {
        // If no results with formatted name, try the raw slug
        if (result.length === 0 && campaignName !== campaignSlug) {
          return fetchBanners(
            clientConfig.airtable.baseId,
            campaignSlug,
            clientConfig.languages,
            true
          );
        }
        return result;
      }),
      clientSubdomain && clientSubdomain !== "admin" && clientSubdomain !== "demo"
        ? fetchClientBySubdomain(clientSubdomain)
        : Promise.resolve(null),
    ]);
    banners = fetchedBanners;
    clientVariables = clientRecord?.clientVariables ?? [];
    clientFormatIds = clientRecord?.formatIds ?? [];
    clientFigmaAssetFile = clientRecord?.figmaAssetFile ?? "";
    // Parse video templates from client record
    try {
      const rawVT = (clientRecord as unknown as Record<string, string> | null)?.["videoTemplates"] ?? "";
      if (rawVT) {
        const parsed = JSON.parse(rawVT);
        if (Array.isArray(parsed)) clientVideoTemplates = parsed;
      }
    } catch { /* ignore */ }
  } catch (error) {
    console.error("Failed to fetch banners:", error);
    return (
      <div className="space-y-4">
        <Link
          href="/campaigns?preview=true"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          ← Back to Calendar
        </Link>
        <h1 className="text-3xl font-light tracking-tight text-gray-900">
          {campaignName}
        </h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          Failed to load banners. Please check your Airtable API key and try again.
        </div>
      </div>
    );
  }

  const backUrl = launchMonthToUrl(launchMonth);
  const backLabel = launchMonth ?? "Calendar";

  // Determine default tab from URL param
  const tabParam = searchParams?.tab;
  const defaultTab = tabParam === "preview" ? "preview" : "copy";

  // Normalise fieldConfig — handles old schema (formats as object, no variables array)
  const resolvedFieldConfig = normaliseFieldConfig(fieldConfig, clientConfig.languages ?? ["ET"]);

  // Count total configured formats for the subtitle
  const { totalConfigured } = countMissingBanners(resolvedFieldConfig, banners);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={backUrl}
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
      >
        ← Back to {backLabel}
      </Link>

      <div className="space-y-1">
        <h1 className="text-3xl font-light tracking-tight text-gray-900">
          {campaignName}
        </h1>
        <p className="text-sm text-gray-500">
          {banners.length} banner{banners.length !== 1 ? "s" : ""} · {totalConfigured} format{totalConfigured !== 1 ? "s" : ""} configured
        </p>
      </div>

      {/* Figma Integration — visible to all platform users (admin, designer, client) */}
      <FigmaIntegrationPanel
        campaignId={campaignId ?? campaignName}
        initialFileKey={figmaCampaignFile}
        initialLastSync={lastFigmaSync}
        hasFigmaToken={!!process.env.FIGMA_ACCESS_TOKEN}
        clientFigmaAssetFile={clientFigmaAssetFile}
        bannerCount={banners.filter((b) => b.bannerType !== "Slide").length}
      />

      {/* Two-tab layout: Copy & Assets | Preview */}
      <CampaignDetailTabs
        campaignId={campaignId ?? campaignName}
        banners={banners}
        fieldConfig={resolvedFieldConfig}
        clientVariables={clientVariables}
        clientFormatIds={clientFormatIds}
        clientVideoTemplates={clientVideoTemplates}
        userRole={userRole}
        defaultTab={defaultTab}
        copySheetUrl={copySheetUrl}
        campaignPublicUrl={`https://${clientSubdomain}.menteproduction.com/campaigns/${encodeURIComponent(campaignName.toLowerCase().replace(/\s+/g, "-"))}`}
      />
    </div>
  );
}
