import { getUserRole } from "@/lib/auth-role";
import { redirect } from "next/navigation";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { fetchClientBySubdomain } from "@/lib/airtable-clients";
import { fetchFormats } from "@/lib/airtable-campaigns";
import { notFound } from "next/navigation";
import Link from "next/link";
import ClientSettingsTabs from "@/components/admin/client-settings-tabs";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const role = await getUserRole();
  const isAdmin = role === "division_admin";

  const clientConfig = getClientConfigFromHeaders();
  const isClientSubdomain =
    clientConfig &&
    clientConfig.id !== "demo" &&
    clientConfig.id !== "admin";

  // Root domain → redirect to /admin (handled by layout, but guard here too)
  if (!isClientSubdomain) {
    redirect("/admin");
  }

  // Fetch the client record for this subdomain
  const [client, formats] = await Promise.all([
    fetchClientBySubdomain(clientConfig.subdomain),
    fetchFormats(),
  ]);

  if (!client) notFound();

  // Client users (non-admin) can only see the Templates tab
  const activeTab = searchParams.tab ?? (isAdmin ? "general" : "templates");

  // If a non-admin tries to access a restricted tab, redirect to templates
  const allowedTabs = isAdmin
    ? ["general", "formats", "variables", "templates", "figma"]
    : ["templates"];

  const resolvedTab = allowedTabs.includes(activeTab) ? activeTab : "templates";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back to Admin — only for division_admin */}
      {isAdmin && (
        <div className="mb-4">
          <Link
            href="https://menteproduction.com/admin"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Admin
          </Link>
        </div>
      )}

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-light text-gray-900">Settings — {client.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {isAdmin
            ? "Manage client configuration, formats, variables, templates, and Figma."
            : "View your saved campaign templates."}
        </p>
      </div>

      {/* Tabs — admin sees all 5; client users see Templates only */}
      <ClientSettingsTabs
        clientId={client.id}
        client={client}
        formats={formats}
        variableSlots={[]}
        activeTab={resolvedTab}
        baseUrl="/settings"
        allowedTabs={allowedTabs}
      />
    </main>
  );
}
