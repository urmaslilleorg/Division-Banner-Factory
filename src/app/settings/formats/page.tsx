import { fetchFormats } from "@/lib/airtable-campaigns";
import FormatManager from "@/components/format-manager";

export default async function FormatsSettingsPage() {
  const formats = await fetchFormats();

  const mapped = formats.map((f) => ({
    id: f.id,
    formatName: f.formatName,
    channel: f.channel,
    device: f.device,
    width: f.widthPx,
    height: f.heightPx,
    safeArea: f.safeArea,
    outputFormat: f.outputFormat,
    figmaFrameBase: f.figmaFrameBase,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Formats</h2>
        <p className="text-sm text-gray-500">
          Manage the master format library. Click any row to edit inline.
        </p>
      </div>
      <FormatManager initialFormats={mapped} />
    </div>
  );
}
