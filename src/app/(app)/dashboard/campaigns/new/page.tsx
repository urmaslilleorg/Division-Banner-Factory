import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { fetchFormats, fetchFormatsByIds } from "@/lib/airtable-campaigns";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { fetchClientBySubdomain } from "@/lib/airtable-clients";
import CampaignBuilderForm from "@/components/campaign-builder-form";
import { VariableDefinition } from "@/components/variables-manager";
import type { CampaignTemplate } from "@/app/api/clients/[clientId]/templates/route";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const CLIENTS_TABLE = "tblE3eM8D5vlRs6Qq";

async function fetchVariableRegistry(): Promise<VariableDefinition[]> {
  const BRAND_ASSETS_TABLE = "tblXAWuxJ47Bejj5w";
  const REGISTRY_RECORD_ID = "recCjnJ8I3v3STPfW";
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BRAND_ASSETS_TABLE}/${REGISTRY_RECORD_ID}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const record = await res.json();
    return JSON.parse(record.fields.Registry_JSON || "[]");
  } catch {
    return [];
  }
}

async function fetchClientTemplates(recordId: string): Promise<CampaignTemplate[]> {
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${recordId}?fields[]=Client_Templates`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json() as { fields: { Client_Templates?: string } };
    const raw = data.fields.Client_Templates;
    if (!raw) return [];
    return JSON.parse(raw) as CampaignTemplate[];
  } catch {
    return [];
  }
}

export default async function NewCampaignPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const clientConfig = getClientConfigFromHeaders();
  const clientName = clientConfig.airtable.campaignFilter || clientConfig.name;
  const clientSubdomain = clientConfig.subdomain;

  const [variableRegistry, clientRecord] = await Promise.all([
    fetchVariableRegistry(),
    clientSubdomain && clientSubdomain !== "admin"
      ? fetchClientBySubdomain(clientSubdomain)
      : Promise.resolve(null),
  ]);

  const clientVariables = clientRecord?.clientVariables ?? [];

  // Fetch only client-linked formats when on a client subdomain
  const formatIds = clientRecord?.formatIds ?? [];
  const formats = formatIds.length > 0
    ? await fetchFormatsByIds(formatIds)
    : await fetchFormats();

  // Fetch saved templates for this client
  const templates = clientRecord?.id
    ? await fetchClientTemplates(clientRecord.id)
    : [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-gray-900">New Campaign</h1>
        <p className="mt-1 text-sm text-gray-500">
          Set up a campaign and generate banner records automatically.
        </p>
      </div>
      <CampaignBuilderForm
        formats={formats}
        variableRegistry={variableRegistry}
        clientName={clientName}
        clientVariables={clientVariables}
        clientId={clientSubdomain !== "admin" ? clientSubdomain : undefined}
        templates={templates}
      />
    </main>
  );
}
