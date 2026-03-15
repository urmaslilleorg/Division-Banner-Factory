"use client";

import { useState, useMemo } from "react";

interface FigmaFileEntry {
  key: string;
  name: string;
  owner: string;
  addedAt: string;
}

interface FigmaIntegrationPanelProps {
  campaignId: string;
  initialFileKey: string | null;
  initialLastSync: string | null;
  hasFigmaToken: boolean;
  /** Raw Figma_Asset_File value from the client record (may be JSON array or legacy key) */
  clientFigmaAssetFile?: string;
}

function parseFigmaFiles(raw: string | undefined): FigmaFileEntry[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as FigmaFileEntry[];
    if (typeof parsed === "string" && parsed.trim()) {
      return [{ key: parsed.trim(), name: "", owner: "", addedAt: "" }];
    }
  } catch {
    if (raw.trim() && !raw.trim().startsWith("[")) {
      return [{ key: raw.trim(), name: "", owner: "", addedAt: "" }];
    }
  }
  return [];
}

export function FigmaIntegrationPanel({
  campaignId,
  initialFileKey,
  initialLastSync,
  hasFigmaToken,
  clientFigmaAssetFile,
}: FigmaIntegrationPanelProps) {
  const figmaFiles = useMemo(() => parseFigmaFiles(clientFigmaAssetFile), [clientFigmaAssetFile]);

  const [fileKey, setFileKey] = useState(initialFileKey ?? "");
  const [selectedFileKey, setSelectedFileKey] = useState(initialFileKey ?? "");
  const [manualMode, setManualMode] = useState(figmaFiles.length === 0);
  const [lastSync] = useState(initialLastSync);
  const [savingKey, setSavingKey] = useState(false);

  // ── Save file key ─────────────────────────────────────────────────────────
  async function saveKey(key: string) {
    if (!key.trim()) return;
    setSavingKey(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Figma_Campaign_File: key.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      console.error("Failed to save file key:", err);
    } finally {
      setSavingKey(false);
    }
  }

  async function handleSaveFileKey() {
    await saveKey(fileKey);
  }

  async function handleDropdownChange(key: string) {
    setSelectedFileKey(key);
    setFileKey(key);
    await saveKey(key);
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

      {/* File selector — dropdown if files available, manual input otherwise */}
      {figmaFiles.length > 0 && !manualMode ? (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 shrink-0 w-16">File</label>
          <select
            value={selectedFileKey}
            onChange={(e) => handleDropdownChange(e.target.value)}
            className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          >
            <option value="">Select a Figma file…</option>
            {figmaFiles.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name ? `${f.name}${f.owner ? ` (${f.owner})` : ""}` : f.key}
              </option>
            ))}
          </select>
          {savingKey && (
            <span className="text-xs text-gray-400 shrink-0">Saving…</span>
          )}
          <button
            type="button"
            onClick={() => setManualMode(true)}
            className="text-xs text-gray-400 hover:text-gray-600 shrink-0 underline"
          >
            Enter key manually
          </button>
        </div>
      ) : figmaFiles.length === 0 && !manualMode ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          No Figma files configured for this client.{" "}
          <a href="/admin" className="underline hover:text-amber-900">
            Add files in Client Settings → Figma tab.
          </a>
        </div>
      ) : (
        /* Manual key input */
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
          {figmaFiles.length > 0 && (
            <button
              type="button"
              onClick={() => setManualMode(false)}
              className="text-xs text-gray-400 hover:text-gray-600 shrink-0 underline"
            >
              Use dropdown
            </button>
          )}
        </div>
      )}

      {/* Last synced timestamp */}
      <div className="text-xs text-gray-400">
        Last synced: <span className="text-gray-600">{formatSync(lastSync)}</span>
      </div>

    </div>
  );
}
