import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { fetchAllBanners } from "@/lib/airtable";
import BannerGrid from "@/components/banner-grid";

export default async function BannersPage() {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  const role =
    (sessionClaims?.metadata as { role?: string })?.role ??
    (sessionClaims?.publicMetadata as { role?: string })?.role ??
    "viewer";

  // Detect root domain vs client subdomain (same pattern as campaigns/page.tsx)
  const headersList = headers();
  const clientId = headersList.get("x-client-id");
  const isRootDomain = !clientId || clientId === "admin";

  if (isRootDomain) {
    if (role === "division_admin") {
      redirect("/admin");
    } else {
      redirect("/");
    }
  }

  const clientConfig = getClientConfigFromHeaders();

  let banners;
  try {
    banners = await fetchAllBanners(clientConfig.airtable.baseId);
  } catch (error) {
    console.error("Failed to fetch banners:", error);
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-light tracking-tight text-gray-900">
          All Banners
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
          All Banners
        </h1>
        <p className="text-sm text-gray-500">
          {banners.length} banner{banners.length !== 1 ? "s" : ""} across all
          campaigns
        </p>
      </div>

      <BannerGrid banners={banners} userRole="division_admin" />
    </div>
  );
}
