"use client";
/**
 * NexdDeliveryPanel — Campaign-level Nexd delivery control.
 * Visible to division_admin only.
 *
 * Shows:
 *  - Sync status summary (synced / total approved banners)
 *  - "Sync to Nexd" button (calls POST /api/nexd/sync-campaign)
 *  - Result log with per-banner status
 */
import { useState } from "react";

interface SyncResult {
  synced: number;
  skipped: number;
  errors: string[];
  syncedNames: string[];
  skippedNames: string[];
}

interface Props {
  campaignId: string;
  campaignName: string;
}

export function NexdDeliveryPanel({ campaignId, campaignName }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function handleSync() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/nexd/sync-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sync failed");
      } else {
        setResult(data as SyncResult);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-900 tracking-tight">
            Nexd Delivery
          </span>
          {result && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-medium text-green-700">
              {result.synced} synced
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${expanded ? "" : "-rotate-90"}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-4">
          <p className="text-sm text-gray-500 leading-relaxed">
            Push all approved banners with a product image to Nexd. Each banner must have a
            format with a{" "}
            <span className="font-medium text-gray-700">Nexd Template ID</span> configured in
            Format Settings. Banners already synced are skipped.
          </p>

          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Syncing...
              </>
            ) : (
              "Sync approved banners to Nexd"
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              {/* Summary row */}
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium text-green-700">
                  {result.synced} synced
                </span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500">
                  {result.skipped} skipped
                </span>
                {result.errors.length > 0 && (
                  <>
                    <span className="text-gray-400">·</span>
                    <span className="font-medium text-red-600">
                      {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}
                    </span>
                  </>
                )}
              </div>

              {/* Synced banners */}
              {result.syncedNames.length > 0 && (
                <div className="rounded-lg bg-green-50 border border-green-100 px-4 py-3">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">
                    Synced
                  </p>
                  <ul className="space-y-1">
                    {result.syncedNames.map((name) => (
                      <li key={name} className="text-xs text-green-800 font-mono">
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Skipped banners */}
              {result.skippedNames.length > 0 && (
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Skipped
                  </p>
                  <ul className="space-y-1">
                    {result.skippedNames.map((name) => (
                      <li key={name} className="text-xs text-gray-500 font-mono">
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3">
                  <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">
                    Errors
                  </p>
                  <ul className="space-y-1">
                    {result.errors.map((err, i) => (
                      <li key={i} className="text-xs text-red-700 font-mono">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Footer note */}
          <p className="text-xs text-gray-400">
            Campaign: <span className="font-mono">{campaignName}</span>
          </p>
        </div>
      )}
    </div>
  );
}
