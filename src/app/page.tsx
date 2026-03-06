import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientConfigFromHeaders } from "@/lib/client-config";

export default async function HomePage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const clientConfig = getClientConfigFromHeaders();

  return (
    <div className="space-y-8">
      {/* Welcome section */}
      <div className="space-y-2">
        <h1 className="text-3xl font-light tracking-tight text-gray-900">
          {clientConfig.name}
        </h1>
        <p className="text-gray-500">
          Banner production platform — manage campaigns, review banners, and
          approve deliverables.
        </p>
      </div>

      {/* Placeholder navigation cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <a
          href="/campaigns"
          className="group rounded-lg border border-gray-200 bg-white p-6 transition-all hover:border-gray-300 hover:shadow-sm"
        >
          <h2 className="text-lg font-medium text-gray-900 group-hover:text-[var(--color-primary)]">
            Campaigns
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            View active campaigns and their banner sets.
          </p>
        </a>

        <a
          href="/banners"
          className="group rounded-lg border border-gray-200 bg-white p-6 transition-all hover:border-gray-300 hover:shadow-sm"
        >
          <h2 className="text-lg font-medium text-gray-900 group-hover:text-[var(--color-primary)]">
            Banners
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Browse all banners, filter by status, and approve deliverables.
          </p>
        </a>

        <a
          href="/settings"
          className="group rounded-lg border border-gray-200 bg-white p-6 transition-all hover:border-gray-300 hover:shadow-sm"
        >
          <h2 className="text-lg font-medium text-gray-900 group-hover:text-[var(--color-primary)]">
            Settings
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Account settings and preferences.
          </p>
        </a>
      </div>

      {/* Client config debug (dev only) */}
      {process.env.NODE_ENV === "development" && (
        <details className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-600">
            Client Config (dev only)
          </summary>
          <pre className="mt-3 overflow-auto text-xs text-gray-500">
            {JSON.stringify(clientConfig, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
