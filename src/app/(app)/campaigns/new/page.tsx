import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { fetchFormats } from "@/lib/airtable-campaigns";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { fetchClientBySubdomain } from "@/lib/airtable-clients";
import CampaignBuilderForm from "@/components/campaign-builder-form";
import { VariableDefinition } from "@/components/variables-manager";

async function fetchVariableRegistry(): Promise<VariableDefinition[]> {
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
    return JSON.parse(record.fields.Registry_JSON || "[]");
  } catch {
    return [];
  }
}

export default async function NewCampaignPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const clientConfig = getClientConfigFromHeaders();
  // Use campaignFilter as the authoritative client name (matches Airtable filter)
  const clientName = clientConfig.airtable.campaignFilter || clientConfig.name;

  const clientSubdomain = clientConfig.subdomain;

  const [formats, variableRegistry, clientRecord] = await Promise.all([
    fetchFormats(),
    fetchVariableRegistry(),
    clientSubdomain && clientSubdomain !== "admin"
      ? fetchClientBySubdomain(clientSubdomain)
      : Promise.resolve(null),
  ]);

  const clientVariables = clientRecord?.clientVariables ?? [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-gray-900">New Campaign</h1>
        <p className="mt-1 text-sm text-gray-500">
          Set up a campaign and generate banner records automatically.
        </p>
      </div>
      <CampaignBuilderForm formats={formats} variableRegistry={variableRegistry} clientName={clientName} clientVariables={clientVariables} />
    </main>
  );
}
