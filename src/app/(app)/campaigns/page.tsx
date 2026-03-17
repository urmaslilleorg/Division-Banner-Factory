import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { getUserRole } from "@/lib/auth-role";
import { fetchAllCampaigns, fetchBannerSummaries } from "@/lib/airtable-campaigns";
import CalendarGrid from "@/components/calendar-grid";
import CampaignHeaderButtons from "@/components/campaign-header-buttons";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: { preview?: string };
}) {
  const userId = "mock-user-id";
  if (!userId) redirect("/");
  const role = await getUserRole();

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
  // Exception: ?preview=true lets admin intentionally preview the client calendar
  if (role === "division_admin" && searchParams.preview !== "true") {
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
  const hasAiKey = !!process.env.ANTHROPIC_API_KEY;

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
          <CampaignHeaderButtons
            hasAiKey={hasAiKey}
            newCampaignHref="/campaigns/new?preview=true"
          />
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
