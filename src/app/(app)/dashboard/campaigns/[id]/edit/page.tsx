import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { fetchCampaignById } from "@/lib/airtable-campaigns";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { fetchClientBySubdomain } from "@/lib/airtable-clients";
import CampaignEditForm from "@/components/campaign-edit-form";
import type { ClientVariable } from "@/lib/types";
import type { VariableDefinition } from "@/components/variables-manager";

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

interface PageProps {
  params: { id: string };
}

export default async function CampaignEditPage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const campaign = await fetchCampaignById(params.id);
  if (!campaign) redirect("/campaigns");

  const clientConfig = getClientConfigFromHeaders();
  const clientSubdomain = clientConfig?.subdomain;

  const [variableRegistry, clientRecord] = await Promise.all([
    fetchVariableRegistry(),
    clientSubdomain && clientSubdomain !== "admin"
      ? fetchClientBySubdomain(clientSubdomain)
      : null,
  ]);

  const clientVariables: ClientVariable[] = clientRecord?.clientVariables ?? [];

  // Fetch only client-linked formats when on a client subdomain
  let formats: import("@/lib/airtable-campaigns").AirtableFormat[] = [];
  if (clientRecord?.formatIds && clientRecord.formatIds.length > 0) {
    const { fetchFormatsByIds } = await import("@/lib/airtable-campaigns");
    formats = await fetchFormatsByIds(clientRecord.formatIds);
  } else {
    const { fetchFormats } = await import("@/lib/airtable-campaigns");
    formats = await fetchFormats();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-gray-900">Edit Campaign</h1>
        <p className="mt-1 text-sm text-gray-500">
          Update campaign metadata. Banner records are not affected.
        </p>
      </div>
      <CampaignEditForm
        campaign={campaign}
        formats={formats}
        variableRegistry={variableRegistry}
        clientVariables={clientVariables}
      />
    </main>
  );
}
