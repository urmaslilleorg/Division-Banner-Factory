import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { fetchBanners } from "@/lib/airtable";
import { fetchAllCampaigns } from "@/lib/airtable-campaigns";
import BannerGrid from "@/components/banner-grid";
import CampaignImportBar from "@/components/campaign-import-bar";
import CopyWorkflowBar from "@/components/copy-workflow-bar";

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
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const clientConfig = getClientConfigFromHeaders();

  // Decode campaign identifier from URL
  const campaignSlug = decodeURIComponent(params.campaign);
  const isRecordId = campaignSlug.startsWith("rec");

  let campaignId: string | null = null;
  let campaignName = campaignSlug;
  let launchMonth: string | null = null;
  let lastImport: string | null = null;
  let columnMapping: string | null = null;
  let copySheetUrl: string | null = null;
  let copyProgress = 0;

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
      lastImport = found.lastImport;
      columnMapping = found.columnMapping;
      copySheetUrl = found.copySheetUrl;
      copyProgress = found.copyProgress;
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

  let banners;
  try {
    banners = await fetchBanners(
      clientConfig.airtable.baseId,
      campaignName,
      clientConfig.languages
    );

    // If no results with formatted name, try the raw slug
    if (banners.length === 0 && campaignName !== campaignSlug) {
      banners = await fetchBanners(
        clientConfig.airtable.baseId,
        campaignSlug,
        clientConfig.languages
      );
    }
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

      {/* Import bar — only shown for division_admin */}
      {userRole === "division_admin" && campaignId && (
        <CampaignImportBar
          campaignId={campaignId}
          campaignName={campaignName}
          lastImport={lastImport}
          hasMapping={!!columnMapping}
        />
      )}

      {/* Copy Workflow bar — only shown for division_admin */}
      {userRole === "division_admin" && campaignId && (
        <CopyWorkflowBar
          campaignId={campaignId}
          campaignName={campaignName}
          copySheetUrl={copySheetUrl}
          copyProgress={copyProgress}
        />
      )}

      <BannerGrid banners={banners} userRole={userRole} />
    </div>
  );
}
