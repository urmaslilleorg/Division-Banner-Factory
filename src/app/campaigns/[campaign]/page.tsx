import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { fetchBanners } from "@/lib/airtable";
import { fetchAllCampaigns } from "@/lib/airtable-campaigns";
import BannerGrid from "@/components/banner-grid";
import CampaignImportBar from "@/components/campaign-import-bar";

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
  let lastImport: string | null = null;
  let columnMapping: string | null = null;

  // Try to find campaign record to get ID, lastImport, columnMapping
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
      lastImport = found.lastImport;
      columnMapping = found.columnMapping;
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

  return (
    <div className="space-y-6">
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

      <BannerGrid banners={banners} userRole={userRole} />
    </div>
  );
}
