import { fetchClientById } from "@/lib/airtable-clients";
import { fetchFormats } from "@/lib/airtable-campaigns";
import NewClientWizard from "@/components/admin/new-client-wizard";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  params: { clientId: string };
}

export default async function EditClientPage({ params }: Props) {
  const [client, formats] = await Promise.all([
    fetchClientById(params.clientId),
    fetchFormats(),
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
        initialData={initialData}
        editId={params.clientId}
      />
    </div>
  );
}
