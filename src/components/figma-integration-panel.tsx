"use client";

import { useState } from "react";

interface FigmaIntegrationPanelProps {
  campaignId: string;
  initialFileKey: string | null;
  initialLastSync: string | null;
  hasFigmaToken: boolean;
}

export function FigmaIntegrationPanel({
  campaignId,
  initialFileKey,
  initialLastSync,
  hasFigmaToken,
}: FigmaIntegrationPanelProps) {
  const [fileKey, setFileKey] = useState(initialFileKey ?? "");
  const [lastSync, setLastSync] = useState(initialLastSync);
  const [savingKey, setSavingKey] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lastPayload, setLastPayload] = useState<object | null>(null);

  // ── Save file key ─────────────────────────────────────────────────────────
  async function handleSaveFileKey() {
    if (!fileKey.trim()) return;
    setSavingKey(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Figma_Campaign_File: fileKey.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      console.error("Failed to save file key:", err);
    } finally {
      setSavingKey(false);
    }
  }

  // ── Sync to Figma ─────────────────────────────────────────────────────────
  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/figma-sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setLastPayload(data);
      setLastSync(data.syncedAt ?? new Date().toISOString());
      setSyncResult(
        `✓ Sync payload ready — ${data.frameCount ?? 0} frame${(data.frameCount ?? 0) !== 1 ? "s" : ""}`
      );
    } catch (err) {
      setSyncError(String(err));
    } finally {
      setSyncing(false);
    }
  }

  // ── Copy JSON ─────────────────────────────────────────────────────────────
  async function handleCopyJson() {
    // If we already have a payload from the last sync, copy it directly.
    // Otherwise, fetch it first.
    let payload = lastPayload;
    if (!payload) {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/figma-sync`, {
          method: "GET",
        });
        payload = await res.json();
        setLastPayload(payload);
      } catch {
        return;
      }
    }
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Format last sync display ──────────────────────────────────────────────
  function formatSync(iso: string | null) {
    if (!iso) return "never";
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 tracking-wide uppercase">
          Figma Integration
        </h2>
        {!hasFigmaToken && (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
            Set FIGMA_ACCESS_TOKEN in Vercel for direct sync
          </span>
        )}
      </div>

      {/* File key row */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 shrink-0 w-16">File key</label>
        <input
          type="text"
          value={fileKey}
          onChange={(e) => setFileKey(e.target.value)}
          placeholder="e.g. Eo5ilHad8HVaEVo87KUAWi"
          className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        <button
          onClick={handleSaveFileKey}
          disabled={savingKey || !fileKey.trim()}
          className="shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {savingKey ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSync}
          disabled={syncing || !fileKey.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
        >
          {syncing ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Syncing…
            </>
          ) : (
            <>🔁 Sync to Figma</>
          )}
        </button>

        <button
          onClick={handleCopyJson}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {copied ? "✓ Copied!" : "📋 Copy JSON"}
        </button>
      </div>

      {/* Status line */}
      <div className="text-xs text-gray-400">
        Last synced: <span className="text-gray-600">{formatSync(lastSync)}</span>
      </div>

      {/* Sync result / error */}
      {syncResult && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          {syncResult}
        </div>
      )}
      {syncError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
          {syncError}
        </div>
      )}
    </div>
  );
}
