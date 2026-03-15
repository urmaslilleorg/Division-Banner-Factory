import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { fetchAllCampaigns, fetchBannerSummaries } from "@/lib/airtable-campaigns";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import Link from "next/link";
import { ChevronLeft, Plus, ArrowRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { DownloadZipButton } from "@/components/download-zip-button";
import { CopyCampaignModal } from "@/components/copy-campaign-modal";

interface PageProps {
  params: { year: string; month: string };
}

const MONTH_NAMES: Record<string, string> = {
  // slug form (e.g. /2026/march)
  january: "January", february: "February", march: "March",
  april: "April", may: "May", june: "June",
  july: "July", august: "August", september: "September",
  october: "October", november: "November", december: "December",
  // numeric form (e.g. /2026/3)
  "1": "January", "2": "February", "3": "March",
  "4": "April", "5": "May", "6": "June",
  "7": "July", "8": "August", "9": "September",
  "10": "October", "11": "November", "12": "December",
};

export default async function MonthDetailPage({ params }: PageProps) {
  const userId = "mock-user-id";
  if (!userId) redirect("/sign-in");

  const year = parseInt(params.year, 10);
  const monthSlug = params.month.toLowerCase();
  const monthName = MONTH_NAMES[monthSlug];

  if (!monthName || isNaN(year)) {
    redirect("/");
  }

  const launchMonthLabel = `${monthName} ${year}`;

  // Use client-scoped filter (same as campaigns/page.tsx) to avoid cross-client data leakage
  void headers(); // ensure headers() is called to opt into dynamic rendering
  const clientConfig = getClientConfigFromHeaders();
  const campaignFilter = clientConfig?.airtable?.campaignFilter || undefined;

  const [campaigns, bannerSummaries] = await Promise.all([
    fetchAllCampaigns(campaignFilter),
    fetchBannerSummaries(),
  ]);

  // Filter campaigns for this month
  const monthCampaigns = campaigns.filter(
    (c) => c.launchMonth === launchMonthLabel
  );

  // Build banner lookup by campaign record ID (reliable) with name fallback
  const bannersByCampaignId = new Map<string, typeof bannerSummaries>();
  const bannersByCampaignName = new Map<string, typeof bannerSummaries>();
  for (const b of bannerSummaries) {
    // Index by campaign record ID
    if (b.campaignId) {
      if (!bannersByCampaignId.has(b.campaignId)) {
        bannersByCampaignId.set(b.campaignId, []);
      }
      bannersByCampaignId.get(b.campaignId)!.push(b);
    }
    // Also index by campaign name as fallback
    if (b.campaignName) {
      if (!bannersByCampaignName.has(b.campaignName)) {
        bannersByCampaignName.set(b.campaignName, []);
      }
      bannersByCampaignName.get(b.campaignName)!.push(b);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/campaigns?preview=true"
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-light text-gray-900">{launchMonthLabel}</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {monthCampaigns.length} campaign{monthCampaigns.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Link
          href="/campaigns/new?preview=true"
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New campaign
        </Link>
      </div>

      {/* Campaign list */}
      {monthCampaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <p className="text-sm text-gray-400">No campaigns for {launchMonthLabel}.</p>
          <Link
            href="/campaigns/new?preview=true"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <Plus className="h-4 w-4" />
            Create the first one
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {monthCampaigns.map((campaign) => {
            // Prefer ID-based lookup (reliable); fall back to name-based lookup
            const banners =
              bannersByCampaignId.get(campaign.id) ||
              bannersByCampaignName.get(campaign.name) ||
              [];
            const total = banners.length;
            const approved = banners.filter((b) => b.approvalStatus === "Approved").length;
            const revision = banners.filter((b) => b.approvalStatus === "Revision_Requested").length;
            const pending = banners.filter(
              (b) => !b.approvalStatus || b.approvalStatus === "Pending"
            ).length;
            const progress = total > 0 ? Math.round((approved / total) * 100) : 0;
            const allApproved = total > 0 && approved === total;

            return (
              <div
                key={campaign.id}
                className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <h2 className="font-medium text-gray-900">{campaign.name}</h2>
                    <span className="text-xs text-gray-400">{campaign.clientName}</span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{total} formats</span>
                    {revision > 0 && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                        {revision} revision{revision > 1 ? "s" : ""}
                      </span>
                    )}
                    {revision === 0 && pending > 0 && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                        {pending} pending
                      </span>
                    )}
                    {revision === 0 && pending === 0 && total > 0 && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                        All approved ✓
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>{approved} of {total} approved</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-1" />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {allApproved && (
                    <DownloadZipButton
                      campaignId={campaign.id}
                      campaignName={campaign.name}
                    />
                  )}
                  <CopyCampaignModal
                    campaignId={campaign.id}
                    campaignName={campaign.name}
                    launchMonth={campaign.launchMonth}
                  />
                  <Link
                    href={`/dashboard/campaigns/${campaign.id}/edit?preview=true`}
                    className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/campaigns/${encodeURIComponent(campaign.name.toLowerCase().replace(/\s+/g, "-"))}?preview=true`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                  >
                    Open
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
