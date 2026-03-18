"use client";

/**
 * ImportSection — collapsible spreadsheet import wizard for the Campaign Builder.
 *
 * Usage:
 *   <ImportSection
 *     savedMapping={campaign.columnMapping}   // null if no previous import
 *     lastImport={campaign.lastImport}        // null if no previous import
 *     onChange={(state) => setImportState(state)}
 *   />
 *
 * The parent form is responsible for executing the import after saving the
 * campaign record (it receives the file + columnMapping via onChange).
 */

import { useState, useCallback, useRef } from "react";
import { ChevronRight, ChevronDown, Loader2 } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PreviewResult {
  headers: string[];
  sampleRows: Record<string, string>[];
  rowCount: number;
  sheetName: string;
}

export interface ImportSectionState {
  file: File | null;
  columnMapping: Record<string, string>;
  syncKeyColumn: string | null;
  preview: PreviewResult | null;
  /** True when user has completed mapping and confirmed they want to import */
  readyToImport: boolean;
}

interface ImportSectionProps {
  /** JSON string of saved Column_Mapping from Airtable (edit mode) */
  savedMapping?: string | null;
  /** ISO timestamp of last import (edit mode) */
  lastImport?: string | null;
  /** Called whenever import state changes */
  onChange: (state: ImportSectionState) => void;
}

// ── Banner Factory field options ──────────────────────────────────────────────

const BF_FIELDS = [
  { value: "ignore", label: "— ignore —" },
  { value: "Sync key", label: "Sync key (required)" },
  { value: "H1", label: "H1" },
  { value: "H2", label: "H2" },
  { value: "H3", label: "H3" },
  { value: "CTA", label: "CTA" },
  { value: "Price_Tag", label: "Price_Tag" },
  { value: "Illustration", label: "Illustration" },
  { value: "Image", label: "Image" },
  { value: "Product_URL", label: "Product_URL" },
  { value: "Promo_Flag", label: "Promo_Flag" },
  { value: "Import_Source", label: "Import_Source" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImportSection({
  savedMapping,
  lastImport,
  onChange,
}: ImportSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1=upload, 2=map, 3=preview
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>(
    () => {
      if (savedMapping) {
        try {
          return JSON.parse(savedMapping);
        } catch {
          return {};
        }
      }
      return {};
    }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedSavedMapping = savedMapping
    ? (() => {
        try {
          return JSON.parse(savedMapping) as Record<string, string>;
        } catch {
          return null;
        }
      })()
    : null;

  const hasPreviousImport = !!parsedSavedMapping && !!lastImport;

  const syncKeyColumn =
    Object.entries(columnMapping).find(([, v]) => v === "Sync key")?.[0] ??
    null;

  const emitState = useCallback(
    (
      newFile: File | null,
      newMapping: Record<string, string>,
      newPreview: PreviewResult | null,
      ready: boolean
    ) => {
      const sk =
        Object.entries(newMapping).find(([, v]) => v === "Sync key")?.[0] ??
        null;
      onChange({
        file: newFile,
        columnMapping: newMapping,
        syncKeyColumn: sk,
        preview: newPreview,
        readyToImport: ready,
      });
    },
    [onChange]
  );

  // ── File upload + preview ──────────────────────────────────────────────────

  const handleFileChange = useCallback(
    async (f: File) => {
      setFile(f);
      setError(null);
      setLoading(true);
      setConfirmed(false);
      try {
        const fd = new FormData();
        fd.append("file", f);
        // Use a temporary endpoint — we don't have a campaignId yet in create mode,
        // so we use a generic preview endpoint.
        const res = await fetch(`/api/import/preview`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) throw new Error(await res.text());
        const data: PreviewResult = await res.json();
        setPreview(data);

        // Build default mapping: start from saved mapping if available
        const defaultMapping: Record<string, string> = {};
        data.headers.forEach((h) => {
          defaultMapping[h] = "ignore";
        });
        const merged = { ...defaultMapping, ...columnMapping };
        // Only keep keys that exist in the new file's headers
        const filtered: Record<string, string> = {};
        data.headers.forEach((h) => {
          filtered[h] = merged[h] ?? "ignore";
        });
        setColumnMapping(filtered);
        setStep(2);
        emitState(f, filtered, data, false);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [columnMapping, emitState]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) handleFileChange(f);
    },
    [handleFileChange]
  );

  const handleMappingChange = (col: string, val: string) => {
    const updated = { ...columnMapping, [col]: val };
    setColumnMapping(updated);
    emitState(file, updated, preview, confirmed);
  };

  const handleConfirm = () => {
    setConfirmed(true);
    emitState(file, columnMapping, preview, true);
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setStep(1);
    setConfirmed(false);
    emitState(null, columnMapping, null, false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const sectionTitle = hasPreviousImport
    ? "Re-import product data"
    : "Import product data from spreadsheet (optional)";

  const lastImportLabel = lastImport
    ? new Date(lastImport).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const savedMappingSummary = parsedSavedMapping
    ? Object.entries(parsedSavedMapping)
        .filter(([, v]) => v !== "ignore")
        .map(([k, v]) => `${k}→${v}`)
        .join(", ")
    : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors rounded-lg"
      >
        <span className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
          {sectionTitle}
        </span>
        {hasPreviousImport && !expanded && (
          <span className="text-xs text-gray-400">
            Last: {lastImportLabel}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-4 space-y-4">
          {/* Previous import info */}
          {hasPreviousImport && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700 space-y-0.5">
              <p>
                <span className="font-medium">Last import:</span>{" "}
                {lastImportLabel}
              </p>
              {savedMappingSummary && (
                <p>
                  <span className="font-medium">Mapping:</span>{" "}
                  {savedMappingSummary}
                </p>
              )}
              <p className="text-blue-500">
                Upload a new file to re-import. Saved mapping is pre-filled.
              </p>
            </div>
          )}

          {/* Step 1: Upload */}
          {step === 1 && (
            <div>
              <p className="text-xs text-gray-500 mb-3">
                Upload a spreadsheet (.xlsx, .xls, .csv) to auto-populate
                banner copy from product data.
              </p>
              <div
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                <p className="text-sm font-medium text-gray-700">
                  Drop your file here or click to browse
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Accepts .xlsx, .xls, .csv
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileChange(f);
                  }}
                />
                {loading && (
                  <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Parsing file…
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Step 2: Map columns */}
          {step === 2 && preview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-700">
                  Map columns from{" "}
                  <span className="font-mono">{file?.name}</span> (
                  {preview.rowCount} rows)
                </p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-gray-400 hover:text-gray-700 underline"
                >
                  Change file
                </button>
              </div>

              {parsedSavedMapping && (
                <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1">
                  Mapping pre-filled from last import. Adjust if columns
                  changed.
                </p>
              )}

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">
                        Client column
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">
                        Banner Factory field
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.headers.map((header) => (
                      <tr key={header} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-700">
                          {header}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
                            value={columnMapping[header] ?? "ignore"}
                            onChange={(e) =>
                              handleMappingChange(header, e.target.value)
                            }
                          >
                            {BF_FIELDS.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={!syncKeyColumn}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-xs text-white hover:bg-gray-700 disabled:opacity-40"
                >
                  Preview import →
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
              {!syncKeyColumn && (
                <p className="text-xs text-amber-600">
                  ⚠ Map at least one column to &ldquo;Sync key&rdquo; to enable import.
                </p>
              )}
            </div>
          )}

          {/* Step 3: Preview + confirm */}
          {step === 3 && preview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-700">
                  Preview — first 5 rows
                </p>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-xs text-gray-400 hover:text-gray-700 underline"
                >
                  ← Edit mapping
                </button>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                <strong>{preview.rowCount} products</strong> in{" "}
                <em>{preview.sheetName}</em>. Import will run after campaign is
                saved — products will be matched to formats × languages.
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.entries(columnMapping)
                        .filter(([, v]) => v !== "ignore")
                        .map(([col, field]) => (
                          <th
                            key={col}
                            className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap"
                          >
                            {field}{" "}
                            <span className="text-gray-400">({col})</span>
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.sampleRows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {Object.entries(columnMapping)
                          .filter(([, v]) => v !== "ignore")
                          .map(([col]) => (
                            <td
                              key={col}
                              className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap max-w-[160px] truncate"
                            >
                              {row[col] || "—"}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {confirmed ? (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                  ✅ Import queued — will run after campaign is saved.
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmed(false);
                      emitState(file, columnMapping, preview, false);
                    }}
                    className="ml-auto text-green-500 hover:text-green-700 underline"
                  >
                    Cancel import
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-xs text-white hover:bg-gray-700"
                >
                  ✓ Queue import
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
