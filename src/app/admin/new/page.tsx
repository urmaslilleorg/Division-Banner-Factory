import { fetchFormats } from "@/lib/airtable-campaigns";
import NewClientWizard from "@/components/admin/new-client-wizard";

export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const formats = await fetchFormats();

  const formatsData = formats.map((f) => ({
    id: f.id,
    formatName: f.formatName,
    channel: f.channel,
    device: f.device,
    width: f.widthPx,
    height: f.heightPx,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">New Client</h1>
        <p className="mt-1 text-sm text-gray-500">
          Set up a new client in the Banner Factory.
        </p>
      </div>
      <NewClientWizard formats={formatsData} />
    </div>
  );
}
