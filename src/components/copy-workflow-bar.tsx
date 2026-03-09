"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Progress } from "@/components/ui/progress";
import { ExternalLink, RefreshCw, CheckCircle2 } from "lucide-react";

interface CopyWorkflowBarProps {
  campaignId: string;
  campaignName: string;
  copySheetUrl: string | null;
  copyProgress: number;
}

export default function CopyWorkflowBar({
  campaignId,
  campaignName,
  copySheetUrl,
  copyProgress: initialProgress,
}: CopyWorkflowBarProps) {
  const router = useRouter();
  const [sheetUrl, setSheetUrl] = useState(copySheetUrl || "");
  const [editingUrl, setEditingUrl] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(initialProgress);
  const [syncResult, setSyncResult] = useState<{
    synced: number;
    skipped: number;
    total: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSaveUrl = async () => {
    setSavingUrl(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Copy_Sheet_URL: sheetUrl.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditingUrl(false);
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingUrl(false);
    }
  };

  const handleSyncApproved = async () => {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/sync-approved`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setProgress(data.progress);
      setSyncResult({
        synced: data.synced,
        skipped: data.skipped,
        total: data.total,
        errors: data.errors || [],
      });
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSyncing(false);
    }
  };

  const allDone = progress === 100;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-700">Copy Workflow</span>
          {allDone && (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Open shared view */}
          {sheetUrl && !editingUrl && (
            <a
              href={sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Open sheet
            </a>
          )}
          {/* Sync approved button */}
          <button
            onClick={handleSyncApproved}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync approved"}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>Copy progress</span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      {/* Sheet URL row */}
      <div className="flex items-center gap-2">
        {editingUrl ? (
          <>
            <input
              type="url"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://airtable.com/... or Google Sheets URL"
              className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              onClick={handleSaveUrl}
              disabled={savingUrl}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              {savingUrl ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => { setEditingUrl(false); setSheetUrl(copySheetUrl || ""); }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditingUrl(true)}
            className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
          >
            {sheetUrl ? "Edit sheet URL" : "+ Add copy sheet URL"}
          </button>
        )}
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 space-y-0.5">
          <p className="font-medium">Sync complete for {campaignName}</p>
          <p>
            {syncResult.synced} banner{syncResult.synced !== 1 ? "s" : ""} marked Copy_approved ·{" "}
            {syncResult.skipped} skipped (no H1_ET) · {syncResult.total} total
          </p>
          {syncResult.errors.length > 0 && (
            <p className="text-amber-700">{syncResult.errors.join("; ")}</p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
