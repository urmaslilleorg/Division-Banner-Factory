import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientConfigFromHeaders } from "@/lib/client-config";

export default async function BannersPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const clientConfig = getClientConfigFromHeaders();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-light tracking-tight text-gray-900">
        Banners
      </h1>
      <p className="text-gray-500">
        Banner grid for {clientConfig.name} will be populated in Phase 2.
      </p>
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center text-sm text-gray-400">
        Banner grid — coming in Phase 2 (Airtable data layer)
      </div>
    </div>
  );
}
