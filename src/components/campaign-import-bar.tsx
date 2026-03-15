"use client";

import { useRouter } from "next/navigation";

interface CampaignImportBarProps {
  campaignId: string;
  campaignName: string;
  lastImport: string | null;
  hasMapping: boolean;
}

export default function CampaignImportBar({
  campaignId,
  lastImport,
  hasMapping,
}: CampaignImportBarProps) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700">Spreadsheet Import</p>
        {lastImport ? (
          <p className="text-xs text-gray-400">
            Last import: {new Date(lastImport).toLocaleDateString("et-EE", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        ) : (
          <p className="text-xs text-gray-400">No imports yet</p>
        )}
      </div>

      <div className="flex gap-2 shrink-0">
        {hasMapping && (
          <button
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            onClick={() => router.push(`/campaigns/${campaignId}/import?preview=true`)}
          >
            Re-sync ↻
          </button>
        )}
        <button
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors"
          onClick={() => router.push(`/campaigns/${campaignId}/import?preview=true`)}
        >
          {hasMapping ? "Import again" : "Import spreadsheet →"}
        </button>
      </div>
    </div>
  );
}
