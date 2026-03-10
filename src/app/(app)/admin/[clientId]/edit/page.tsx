import { fetchClientById } from "@/lib/airtable-clients";
import { fetchFormats } from "@/lib/airtable-campaigns";
import NewClientWizard from "@/components/admin/new-client-wizard";
import { notFound } from "next/navigation";
import type { VariableDefinition } from "@/components/variables-manager";

export const dynamic = "force-dynamic";

interface Props {
  params: { clientId: string };
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

export default async function EditClientPage({ params }: Props) {
  const [client, formats, variableSlots] = await Promise.all([
    fetchClientById(params.clientId),
    fetchFormats(),
    fetchVariableSlots(),
  ]);

  if (!client) notFound();

  const initialData = {
    clientName: client.name,
    subdomain: client.subdomain,
    status: client.status === "Archived" ? "Draft" : client.status,
    languages: client.languages,
    campaignFilter: client.campaignFilter,
    notes: client.notes,
    primaryColor: client.primaryColor,
    secondaryColor: client.secondaryColor,
    accentColor: client.accentColor,
    backgroundColor: client.backgroundColor,
    selectedFormatIds: client.formatIds,
    figmaAssetFile: client.figmaAssetFile,
    logoUrl: client.logoUrl,
    clientVariables: client.clientVariables,
  } as Parameters<typeof NewClientWizard>[0]["initialData"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Edit Client — {client.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Update client configuration and settings.
        </p>
      </div>
      <NewClientWizard
        formats={formats}
        variableSlots={variableSlots}
        initialData={initialData}
        editId={params.clientId}
      />
    </div>
  );
}
