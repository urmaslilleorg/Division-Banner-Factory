import { fetchClientById } from "@/lib/airtable-clients";
import { fetchFormats } from "@/lib/airtable-campaigns";
import { notFound } from "next/navigation";
import Link from "next/link";
import ClientSettingsTabs from "@/components/admin/client-settings-tabs";
import type { VariableDefinition } from "@/components/variables-manager";

export const dynamic = "force-dynamic";

interface Props {
  params: { clientId: string };
  searchParams: { tab?: string };
}

async function fetchVariableSlots(): Promise<string[]> {
  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
  const BASE_ID = "appIqinespXjbIERp";
  const BRAND_ASSETS_TABLE = "tblXAWuxJ47Bejj5w";
  const REGISTRY_RECORD_ID = "recCjnJ8I3v3STPfW";
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BRAND_ASSETS_TABLE}/${REGISTRY_RECORD_ID}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const record = await res.json();
    const vars: VariableDefinition[] = JSON.parse(record.fields.Registry_JSON || "[]");
    return vars.map((v) => v.id);
  } catch {
    return [];
  }
}

export default async function ClientSettingsPage({ params, searchParams }: Props) {
  const [client, formats, variableSlots] = await Promise.all([
    fetchClientById(params.clientId),
    fetchFormats(),
    fetchVariableSlots(),
  ]);

  if (!client) notFound();

  const activeTab = searchParams.tab ?? "general";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Clients
        </Link>
      </div>

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{client.name} — Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Client-specific configuration. All data is scoped to this client only.
        </p>
      </div>

      {/* Tabbed interface */}
      <ClientSettingsTabs
        clientId={params.clientId}
        client={client}
        formats={formats}
        variableSlots={variableSlots}
        activeTab={activeTab}
        baseUrl={`/admin/${params.clientId}/settings`}
      />
    </div>
  );
}
