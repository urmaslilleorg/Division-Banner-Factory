"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CampaignImportBarProps {
  campaignId: string;
  campaignName: string;
  lastImport: string | null;
  hasMapping: boolean;
}

export default function CampaignImportBar({
  campaignId,
  campaignName,
  lastImport,
  hasMapping,
}: CampaignImportBarProps) {
  const router = useRouter();

  // ── Copy Campaign modal state ───────────────────────────────────────────────
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [newName, setNewName] = useState(`${campaignName}_copy`);
  const [copyBanners, setCopyBanners] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleCopy = async () => {
    if (!newName.trim()) return;
    setCopying(true);
    setCopyError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: newName.trim(), copyBanners }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Copy failed");
      }
      const data = await res.json();
      setShowCopyModal(false);
      router.push(`/campaigns/${encodeURIComponent(data.campaignName)}`);
    } catch (err) {
      setCopyError(String(err));
    } finally {
      setCopying(false);
    }
  };

  return (
    <>
      {/* Import bar */}
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
              onClick={() => router.push(`/campaigns/${campaignId}/import`)}
            >
              Re-sync ↻
            </button>
          )}
          <button
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors"
            onClick={() => router.push(`/campaigns/${campaignId}/import`)}
          >
            {hasMapping ? "Import again" : "Import spreadsheet →"}
          </button>
          <button
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
            onClick={() => {
              setNewName(`${campaignName}_copy`);
              setCopyBanners(false);
              setCopyError(null);
              setShowCopyModal(true);
            }}
          >
            Copy campaign
          </button>
        </div>
      </div>

      {/* Copy Campaign modal */}
      {showCopyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-medium text-gray-900">Copy campaign</h2>
              <p className="text-sm text-gray-500 mt-1">
                Creates a new campaign with the same settings. Optionally copies all banner records.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  New campaign name
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. K-Rauta_Week13"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 accent-gray-900"
                  checked={copyBanners}
                  onChange={(e) => setCopyBanners(e.target.checked)}
                />
                <span className="text-sm text-gray-700">
                  Copy banner records (reset status to Brief_received)
                </span>
              </label>
            </div>

            {copyError && (
              <p className="text-sm text-red-600">{copyError}</p>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <button
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => setShowCopyModal(false)}
                disabled={copying}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-40"
                disabled={!newName.trim() || copying}
                onClick={handleCopy}
              >
                {copying ? "Copying…" : "Copy campaign →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
