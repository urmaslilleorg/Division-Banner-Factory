import { fetchFormats } from "@/lib/airtable-campaigns";
import { fetchAllClients } from "@/lib/airtable-clients";
import AdminFormatManager from "@/components/admin/admin-format-manager";

export const dynamic = "force-dynamic";

export default async function AdminFormatsPage() {
  const [formats, clients] = await Promise.all([
    fetchFormats(),
    fetchAllClients(),
  ]);

  // Build a map of formatId → client names that use it
  const usedByMap: Record<string, string[]> = {};
  for (const client of clients) {
    for (const fid of client.formatIds) {
      if (!usedByMap[fid]) usedByMap[fid] = [];
      usedByMap[fid].push(client.name);
    }
  }

  const formatsData = formats.map((f) => ({
    id: f.id,
    formatName: f.formatName,
    channel: f.channel,
    device: f.device,
    width: f.widthPx,
    height: f.heightPx,
    safeArea: f.safeArea,
    outputFormat: f.outputFormat,
    figmaFrameBase: f.figmaFrameBase,
    usedBy: usedByMap[f.id] || [],
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Master Formats</h1>
        <p className="mt-1 text-sm text-gray-500">
          The master format library. Click any row to edit inline.
        </p>
      </div>
      <AdminFormatManager initialFormats={formatsData} />
    </div>
  );
}
