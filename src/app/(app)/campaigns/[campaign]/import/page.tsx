"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";

// ── Types ────────────────────────────────────────────────────────────────────

interface PreviewResult {
  headers: string[];
  sampleRows: Record<string, string>[];
  rowCount: number;
  sheetName: string;
}

interface ImportResult {
  created: number;
  updated: number;
  archived: number;
  errors: string[];
}

const BF_FIELDS = [
  { value: "ignore", label: "— ignore —" },
  { value: "Sync key", label: "🔑 Sync key (required)" },
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

// ── Component ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const router = useRouter();
  const { campaign: campaignId } = useParams<{ campaign: string }>();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [savedMapping, setSavedMapping] = useState<Record<string, string> | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Step 1: Upload ──────────────────────────────────────────────────────────

  const handleFileChange = useCallback(
    async (f: File) => {
      setFile(f);
      setError(null);
      setLoading(true);
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch(`/api/campaigns/${campaignId}/import/preview`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) throw new Error(await res.text());
        const data: PreviewResult = await res.json();
        setPreview(data);

        // Check for saved mapping
        const campaignRes = await fetch(`/api/campaigns/${campaignId}`);
        if (campaignRes.ok) {
          const campaignData = await campaignRes.json();
          if (campaignData.columnMapping) {
            try {
              const saved = JSON.parse(campaignData.columnMapping);
              setSavedMapping(saved);
              setColumnMapping(saved);
            } catch {
              // ignore
            }
          }
        }

        // Default mapping: auto-map columns to "ignore"
        const defaultMapping: Record<string, string> = {};
        data.headers.forEach((h) => {
          defaultMapping[h] = "ignore";
        });
        setColumnMapping((prev) => ({ ...defaultMapping, ...prev }));

        setStep(2);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [campaignId]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) handleFileChange(f);
    },
    [handleFileChange]
  );

  // ── Step 2: Map columns ─────────────────────────────────────────────────────

  const syncKeyColumn = Object.entries(columnMapping).find(
    ([, v]) => v === "Sync key"
  )?.[0];

  const handleMappingChange = (clientCol: string, bfField: string) => {
    setColumnMapping((prev) => ({ ...prev, [clientCol]: bfField }));
  };

  // ── Step 3: Preview ─────────────────────────────────────────────────────────

  const estimatedBanners = preview
    ? `~${preview.rowCount} products × formats`
    : "";

  // ── Step 4: Import ──────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!file || !syncKeyColumn) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("columnMapping", JSON.stringify(columnMapping));
      fd.append("syncKey", syncKeyColumn);
      const res = await fetch(`/api/campaigns/${campaignId}/import/execute`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Import failed");
      }
      const result: ImportResult = await res.json();
      setImportResult(result);
      setStep(4);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const steps = [
    { n: 1, label: "Upload" },
    { n: 2, label: "Map columns" },
    { n: 3, label: "Preview" },
    { n: 4, label: "Import" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-light tracking-tight text-gray-900">
          Spreadsheet Import
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Import product data from Excel or CSV into this campaign.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                step === s.n
                  ? "bg-gray-900 text-white"
                  : step > s.n
                  ? "bg-green-500 text-white"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {step > s.n ? "✓" : s.n}
            </div>
            <span
              className={`text-sm ${
                step === s.n ? "font-medium text-gray-900" : "text-gray-400"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className="h-px w-8 bg-gray-200" />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Step 1: Upload ── */}
      {step === 1 && (
        <div
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center hover:border-gray-400 transition-colors cursor-pointer"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="text-4xl mb-3">📥</div>
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
            <p className="text-xs text-gray-500 mt-4 animate-pulse">
              Parsing file…
            </p>
          )}
        </div>
      )}

      {/* ── Step 2: Map columns ── */}
      {step === 2 && preview && (
        <div className="space-y-6">
          {savedMapping && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              Using saved mapping from last import. Update if columns changed.
            </div>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <strong>Sync key (required)</strong> — the column that uniquely
            identifies each product across weekly imports (e.g. KOOD).
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Client column
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Banner Factory field
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.headers.map((header) => (
                  <tr key={header} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {header}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
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

          <div className="flex gap-3">
            <button
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
              onClick={() => setStep(1)}
            >
              ← Back
            </button>
            <button
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-40"
              disabled={!syncKeyColumn}
              onClick={() => setStep(3)}
            >
              Preview →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview ── */}
      {step === 3 && preview && (
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <p>
              <strong>{preview.rowCount} products</strong> detected in{" "}
              <em>{preview.sheetName}</em>. {estimatedBanners}.
            </p>
            {!syncKeyColumn && (
              <p className="mt-2 text-amber-700 font-medium">
                ⚠ No Sync key selected — import cannot run.
              </p>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
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
                        {field === "Sync key" ? "🔑 " : ""}
                        {field} <span className="text-gray-400">({col})</span>
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
                          className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap max-w-[180px] truncate"
                        >
                          {row[col] || "—"}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">Showing first 5 rows</p>

          <div className="flex gap-3">
            <button
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
              onClick={() => setStep(2)}
            >
              ← Edit mapping
            </button>
            <button
              className="rounded-lg bg-gray-900 px-6 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-40"
              disabled={!syncKeyColumn || loading}
              onClick={handleImport}
            >
              {loading ? "Importing…" : "Run import →"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Result ── */}
      {step === 4 && importResult && (
        <div className="space-y-6">
          <div className="rounded-xl border border-green-200 bg-green-50 p-6 space-y-3">
            <p className="text-lg font-medium text-green-800">
              ✅ Import complete
            </p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="rounded-lg bg-white border border-green-100 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">
                  {importResult.created}
                </p>
                <p className="text-gray-500">Created</p>
              </div>
              <div className="rounded-lg bg-white border border-green-100 p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {importResult.updated}
                </p>
                <p className="text-gray-500">Updated</p>
              </div>
              <div className="rounded-lg bg-white border border-green-100 p-3 text-center">
                <p className="text-2xl font-bold text-gray-400">
                  {importResult.archived}
                </p>
                <p className="text-gray-500">Archived</p>
              </div>
            </div>
            {importResult.errors.length > 0 && (
              <details className="text-sm text-red-700">
                <summary className="cursor-pointer font-medium">
                  {importResult.errors.length} error(s)
                </summary>
                <ul className="mt-2 list-disc pl-5 space-y-1">
                  {importResult.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <button
            className="rounded-lg bg-gray-900 px-6 py-2 text-sm text-white hover:bg-gray-700"
            onClick={() => router.push(`/campaigns/${campaignId}`)}
          >
            View campaign →
          </button>
        </div>
      )}
    </div>
  );
}
