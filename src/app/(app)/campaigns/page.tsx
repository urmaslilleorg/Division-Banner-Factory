import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { fetchAllCampaigns, fetchBannerSummaries } from "@/lib/airtable-campaigns";
import CalendarGrid from "@/components/calendar-grid";
import Link from "next/link";
import { Plus } from "lucide-react";

export default async function CampaignsPage() {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/");

  // Check metadata (Clerk custom claim) first, fall back to publicMetadata, then 'viewer'
  const role =
    (sessionClaims?.metadata as { role?: string })?.role ??
    (sessionClaims?.publicMetadata as { role?: string })?.role ??
    "viewer";
  // All authenticated roles (including division_admin) see the campaign calendar.
  // /admin is accessible via the Admin nav link.

  const clientConfig = getClientConfigFromHeaders();

  // Use client-scoped filter when on a subdomain; undefined = all campaigns (division_admin)
  const campaignFilter = clientConfig?.airtable?.campaignFilter || undefined;

  const [campaigns, bannerSummaries] = await Promise.all([
    fetchAllCampaigns(campaignFilter),
    fetchBannerSummaries(),
  ]);

  const userRole = role;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-light text-gray-900">Campaign Calendar</h1>
          <p className="mt-1 text-sm text-gray-500">
            {clientConfig.name} · {campaigns.length} campaign
            {campaigns.length !== 1 ? "s" : ""}
          </p>
        </div>
        {(role === "division_admin" || role === "division_designer") && (
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New campaign
          </Link>
        )}
      </div>
      <CalendarGrid
        campaigns={campaigns}
        bannerSummaries={bannerSummaries}
        userRole={userRole}
      />
    </main>
  );
}
