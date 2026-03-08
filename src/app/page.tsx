import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { fetchAllCampaigns, fetchBannerSummaries } from "@/lib/airtable-campaigns";
import CalendarGrid from "@/components/calendar-grid";
import Link from "next/link";
import { Plus } from "lucide-react";

export default async function HomePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const clientConfig = getClientConfigFromHeaders();

  // Fetch all campaigns + banner summaries in parallel
  const [campaigns, bannerSummaries] = await Promise.all([
    fetchAllCampaigns(),
    fetchBannerSummaries(),
  ]);

  // TODO: derive role from Clerk session claims when roles are configured
  const userRole = "division_admin";

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
        <Link
          href="/dashboard/campaigns/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New campaign
        </Link>
      </div>

      <CalendarGrid
        campaigns={campaigns}
        bannerSummaries={bannerSummaries}
        userRole={userRole}
      />
    </main>
  );
}
