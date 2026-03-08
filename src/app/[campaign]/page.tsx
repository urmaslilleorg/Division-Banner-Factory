import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { fetchBanners } from "@/lib/airtable";
import BannerGrid from "@/components/banner-grid";

interface CampaignPageProps {
  params: { campaign: string };
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const clientConfig = getClientConfigFromHeaders();

  // Decode campaign name from URL (e.g. "March%202025" → "March 2025")
  const campaignName = decodeURIComponent(params.campaign);

  // Fetch banners from Airtable, filtered by campaign
  let banners;
  try {
    banners = await fetchBanners(
      clientConfig.airtable.baseId,
      campaignName,
      clientConfig.languages
    );
  } catch (error) {
    console.error("Failed to fetch banners:", error);
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-light tracking-tight text-gray-900">
          {campaignName}
        </h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          Failed to load banners. Please check your Airtable API key and try
          again.
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
          {banners.length} banner{banners.length !== 1 ? "s" : ""} in this
          campaign
        </p>
      </div>

      <BannerGrid banners={banners} />
    </div>
  );
}
