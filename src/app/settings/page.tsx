import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientConfigFromHeaders } from "@/lib/client-config";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const clientConfig = getClientConfigFromHeaders();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-light tracking-tight text-gray-900">
        Settings
      </h1>
      <p className="text-gray-500">
        Account settings for {clientConfig.name}.
      </p>
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center text-sm text-gray-400">
        Settings panel — coming in a future phase
      </div>
    </div>
  );
}
