import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { fetchBanners } from "@/lib/airtable";
import { fetchAllCampaigns } from "@/lib/airtable-campaigns";
import { fetchClientBySubdomain } from "@/lib/airtable-clients";
import CampaignDetailTabs from "@/components/campaign-detail-tabs";

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

interface CampaignPageProps {
  params: { campaign: string };
  searchParams?: { tab?: string };
}

export default async function CampaignPage({ params, searchParams }: CampaignPageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const clientConfig = getClientConfigFromHeaders();

  // Decode campaign identifier from URL
  const campaignSlug = decodeURIComponent(params.campaign);
  const isRecordId = campaignSlug.startsWith("rec");

  let campaignId: string | null = null;
  let campaignName = campaignSlug;
  let launchMonth: string | null = null;
  let fieldConfig = null;

  // Try to find campaign record to get ID and metadata
  try {
    const campaigns = await fetchAllCampaigns();
    const formattedName = campaignSlug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    const found = isRecordId
      ? campaigns.find((c) => c.id === campaignSlug)
      : campaigns.find((c) => c.name === formattedName) ||
        campaigns.find((c) => c.name === campaignSlug) ||
        campaigns.find((c) => c.name.toLowerCase() === campaignSlug.toLowerCase());
    if (found) {
      campaignId = found.id;
      campaignName = found.name;
      launchMonth = found.launchMonth ?? null;
      fieldConfig = found.fieldConfig;
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

  // TODO: derive role from Clerk session claims
  const userRole = "division_admin";

  // Fetch banners and client variables in parallel
  const clientSubdomain = clientConfig.subdomain || clientConfig.id;
  let banners;
  let clientVariables: import("@/lib/types").ClientVariable[] = [];

  try {
    const [fetchedBanners, clientRecord] = await Promise.all([
      fetchBanners(
        clientConfig.airtable.baseId,
        campaignName,
        clientConfig.languages
      ).then(async (result) => {
        // If no results with formatted name, try the raw slug
        if (result.length === 0 && campaignName !== campaignSlug) {
          return fetchBanners(
            clientConfig.airtable.baseId,
            campaignSlug,
            clientConfig.languages
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
  } catch (error) {
    console.error("Failed to fetch banners:", error);
    return (
      <div className="space-y-4">
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

  // Resolve fieldConfig with sensible defaults
  const resolvedFieldConfig = fieldConfig ?? {
    variables: ["H1", "H2", "CTA"],
    languages: clientConfig.languages ?? ["ET"],
    formats: [],
  };

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
          {banners.length} banner{banners.length !== 1 ? "s" : ""} in this campaign
        </p>
      </div>

      {/* Two-tab layout: Copy & Assets | Preview */}
      <CampaignDetailTabs
        campaignId={campaignId ?? campaignName}
        banners={banners}
        fieldConfig={resolvedFieldConfig}
        clientVariables={clientVariables}
        userRole={userRole}
        defaultTab={defaultTab}
      />
    </div>
  );
}
