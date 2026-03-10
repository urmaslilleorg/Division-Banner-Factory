import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
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

  // Detect whether we are on a client subdomain or the root domain.
  // Middleware sets x-client-id only when a real client config exists (subdomain).
  // On root domain (menteproduction.com), x-client-id is NOT set.
  const headersList = headers();
  const clientId = headersList.get("x-client-id");
  const isRootDomain = !clientId || clientId === "admin";

  if (isRootDomain) {
    // Root domain has no client context — redirect based on role
    if (role === "division_admin") {
      redirect("/admin");
    } else {
      redirect("/");
    }
  }

  // Subdomain context — admin should not see client calendars; send them home
  if (role === "division_admin") {
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "menteproduction.com";
    redirect(`https://${appDomain}/admin`);
  }

  // Subdomain context — show client-scoped campaign calendar
  const clientConfig = getClientConfigFromHeaders();

  // Use client-scoped filter from the client config
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
