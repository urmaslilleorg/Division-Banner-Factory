import { fetchClientById } from "@/lib/airtable-clients";
import { notFound } from "next/navigation";
import AssetLibraryViewer from "@/components/admin/asset-library-viewer";

export const dynamic = "force-dynamic";

interface Props {
  params: { clientId: string };
}

export default async function ClientAssetsPage({ params }: Props) {
  const client = await fetchClientById(params.clientId);
  if (!client) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          {client.name} — Asset Library
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Read-only view of the Figma asset library for this client.
        </p>
      </div>
      <AssetLibraryViewer
        clientId={client.id}
        figmaAssetFile={client.figmaAssetFile}
      />
    </div>
  );
}
