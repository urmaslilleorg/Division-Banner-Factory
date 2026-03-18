"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ChevronDown, ChevronRight, RefreshCw, Loader2, X, Check } from "lucide-react";
import type { AirtableFormat } from "@/lib/airtable-campaigns";
import FormatPicker from "@/components/format-picker";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NexdTemplate {
  id: string;
  name: string;
  placementType: string;
  engine: string;
  device: number;
  isVideo: boolean;
  previewUrl?: string;
}

// Raw Airtable record shape returned by GET /api/formats
interface RawFormatRecord {
  id: string;
  fields: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deviceLabel(device: number): string {
  switch (device) {
    case 1: return "Mobile";
    case 2: return "Desktop";
    case 3: return "Responsive";
    default: return "All";
  }
}

function parseAirtableFormat(r: RawFormatRecord): AirtableFormat {
  return {
    id: r.id,
    formatName: (r.fields["Format_Name"] as string) || "",
    widthPx: (r.fields["Width"] as number) || 0,
    heightPx: (r.fields["Height"] as number) || 0,
    channel: (r.fields["Channel"] as string) || "Other",
    device: (r.fields["Device"] as string) || "",
    figmaFrameBase: (r.fields["Figma_Frame_Base"] as string) || "",
    safeArea: (r.fields["Safe_Area"] as string) || "",
    outputFormat: (r.fields["Output_Format"] as string) || "PNG",
    active: (r.fields["Active"] as boolean) || false,
    isVideo: (r.fields["Is_Video"] as boolean) || false,
    nexdTemplateId: (r.fields["Nexd_Template_ID"] as string) || "",
    nexdTemplateIds: (() => {
      const raw = r.fields["Nexd_Template_IDs"] as string | undefined;
      if (!raw) return [];
      try { return JSON.parse(raw) as string[]; } catch { return []; }
    })(),
  };
}

// ── Map Formats Modal ─────────────────────────────────────────────────────────

interface MapFormatsModalProps {
  template: NexdTemplate;
  allFormats: AirtableFormat[];
  onClose: () => void;
  onSaved: (templateId: string, selectedFormatIds: string[]) => void;
}

function MapFormatsModal({ template, allFormats, onClose, onSaved }: MapFormatsModalProps) {
  const initialSelected = useMemo(
    () => allFormats.filter((f) => f.nexdTemplateIds.includes(template.id)).map((f) => f.id),
    [allFormats, template.id]
  );
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Determine which formats need to be added and which need to be cleared
      const toAdd = selected.filter((id) => !initialSelected.includes(id));
      const toRemove = initialSelected.filter((id) => !selected.includes(id));

      const patches: Promise<Response>[] = [];

      for (const id of toAdd) {
        const fmt = allFormats.find((f) => f.id === id);
        const currentIds = fmt?.nexdTemplateIds ?? [];
        const newIds = currentIds.includes(template.id) ? currentIds : [...currentIds, template.id];
        patches.push(
          fetch(`/api/formats/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nexdTemplateIds: newIds }),
          })
        );
      }
      for (const id of toRemove) {
        const fmt = allFormats.find((f) => f.id === id);
        const currentIds = fmt?.nexdTemplateIds ?? [];
        const newIds = currentIds.filter((tid) => tid !== template.id);
        patches.push(
          fetch(`/api/formats/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nexdTemplateIds: newIds }),
          })
        );
      }

      const results = await Promise.all(patches);
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) throw new Error(`${failed.length} update(s) failed`);

      onSaved(template.id, selected);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Map formats to template</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              <span className="font-mono text-gray-400">[{template.id}]</span>{" "}
              {template.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — FormatPicker */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-xs text-gray-500">
            Select which Mente master formats should be delivered through this Nexd template.
            Formats with a Nexd template ID set will be synced when &ldquo;Sync to Nexd&rdquo; is triggered.
          </p>
          <FormatPicker
            formats={allFormats}
            selected={selected}
            onChange={setSelected}
            showCount
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
          {error ? (
            <p className="text-xs text-red-600">{error}</p>
          ) : (
            <p className="text-xs text-gray-400">
              {selected.length} format{selected.length !== 1 ? "s" : ""} selected
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Save mapping
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Template Row ──────────────────────────────────────────────────────────────

// ── MappedFormatsCell ─────────────────────────────────────────────────────────

interface MappedFormatsCellProps {
  mappedFormats: AirtableFormat[];
  templateId: string;
  onUnmapFormat: (formatId: string, templateId: string) => void;
}

function MappedFormatsCell({ mappedFormats, templateId, onUnmapFormat }: MappedFormatsCellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (mappedFormats.length === 0) {
    return <span className="text-xs text-gray-300">—</span>;
  }

  return (
    <div className="inline-flex justify-end" ref={ref}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-100 transition-colors"
        >
          {mappedFormats.length} {mappedFormats.length === 1 ? "format" : "formats"}
          <svg viewBox="0 0 10 6" className={`h-2.5 w-2.5 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 1l4 4 4-4" /></svg>
        </button>
        {open && (
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white shadow-lg py-1">
            {mappedFormats.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-gray-50">
                <span className="text-xs text-gray-700 truncate">{f.formatName}</span>
                <button
                  type="button"
                  onClick={() => { onUnmapFormat(f.id, templateId); }}
                  className="shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                  title="Remove mapping"
                >
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 2l8 8M10 2l-8 8" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TemplateRow ───────────────────────────────────────────────────────────────

interface TemplateRowProps {
  template: NexdTemplate;
  mappedFormats: AirtableFormat[];
  onMapFormats: (template: NexdTemplate) => void;
  onUnmapFormat: (formatId: string, templateId: string) => void;
}

function TemplateRow({ template, mappedFormats, onMapFormats, onUnmapFormat }: TemplateRowProps) {
  const cellCls = "px-3 py-2 text-sm text-gray-700 whitespace-nowrap";

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
      <td className={cellCls + " font-medium"}>{template.name}</td>
      <td className={cellCls}>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
          {template.placementType}
        </span>
      </td>
      <td className={cellCls + " text-xs text-gray-500"}>{deviceLabel(template.device)}</td>
      <td className={cellCls}>
        {template.isVideo ? (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
            Yes
          </span>
        ) : (
          <span className="text-xs text-gray-400">No</span>
        )}
      </td>
      <td className={cellCls + " font-mono text-xs text-gray-400"}>{template.engine}</td>
      <td className={cellCls + " font-mono text-xs text-gray-400"}>{template.id}</td>
      {/* Mapped column */}
      <td className="px-3 py-2 text-right">
        <MappedFormatsCell
          mappedFormats={mappedFormats}
          templateId={template.id}
          onUnmapFormat={onUnmapFormat}
        />
      </td>
      {/* Action column */}
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={() => onMapFormats(template)}
          className="rounded border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors whitespace-nowrap"
        >
          + Map formats
        </button>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NexdTemplatesSection({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [templates, setTemplates] = useState<NexdTemplate[]>([]);
  const [allFormats, setAllFormats] = useState<AirtableFormat[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [mappingTemplate, setMappingTemplate] = useState<NexdTemplate | null>(null);
  // Track whether we've attempted at least one fetch — prevents infinite loop
  // when the API returns an empty array (templates.length stays 0 forever).
  const hasFetched = useRef(false);

  // Load formats (needed for mapping display)
  const loadFormats = useCallback(async () => {
    try {
      const res = await fetch("/api/formats");
      if (!res.ok) return;
      const records: RawFormatRecord[] = await res.json();
      setAllFormats(records.map(parseAirtableFormat));
    } catch {
      // non-fatal
    }
  }, []);

  // Load templates from API
  const loadTemplates = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const url = forceRefresh ? "/api/nexd/templates?refresh=1" : "/api/nexd/templates";
      const res = await fetch(url);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const d = await res.json();
      setTemplates(d.templates ?? []);
      setCachedAt(d.cachedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load on first expand (only once — hasFetched prevents infinite re-trigger
  // when the API returns an empty array).
  useEffect(() => {
    if (open && !hasFetched.current && !loading) {
      hasFetched.current = true;
      loadTemplates();
      loadFormats();
    }
  }, [open, loading, loadTemplates, loadFormats]);

  // Group templates by placementType
  const grouped = useMemo(() => {
    const map = new Map<string, NexdTemplate[]>();
    for (const t of templates) {
      const key = t.placementType || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    // Sort within each group by name
    Array.from(map.values()).forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name)));
    // Sort groups by name
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [templates]);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = new Set(Array.from(prev));
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // After saving a mapping, update the local allFormats state
  const handleMappingSaved = (templateId: string, selectedFormatIds: string[]) => {
    setAllFormats((prev) =>
      prev.map((f) => {
        const wasSelected = selectedFormatIds.includes(f.id);
        const wasMapped = f.nexdTemplateIds.includes(templateId);
        if (wasSelected && !wasMapped) {
          return { ...f, nexdTemplateIds: [...f.nexdTemplateIds, templateId] };
        }
        if (!wasSelected && wasMapped) {
          return { ...f, nexdTemplateIds: f.nexdTemplateIds.filter((id) => id !== templateId) };
        }
        return f;
      })
    );
  };

  // Unmap a single format from a specific Nexd template
  // The unmap button is inside a TemplateRow, so we need to know which templateId to remove.
  // We pass the templateId through the handler.
  const handleUnmapFormat = async (formatId: string, templateId: string) => {
    // Optimistic update
    setAllFormats((prev) =>
      prev.map((f) =>
        f.id === formatId
          ? { ...f, nexdTemplateIds: f.nexdTemplateIds.filter((id) => id !== templateId) }
          : f
      )
    );
    try {
      const fmt = allFormats.find((f) => f.id === formatId);
      const currentIds = fmt?.nexdTemplateIds ?? [];
      const newIds = currentIds.filter((id) => id !== templateId);
      await fetch(`/api/formats/${formatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nexdTemplateIds: newIds }),
      });
    } catch {
      // Revert on failure — reload formats
      loadFormats();
    }
  };

  const tableHeader = (
    <thead>
      <tr className="bg-gray-50">
        {["Template name", "Type", "Device", "Video", "Base", "ID"].map((h) => (
          <th
            key={h}
            className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            {h}
          </th>
        ))}
        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
          Mapped
        </th>
        <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
          Action
        </th>
      </tr>
    </thead>
  );

  return (
    <>
      {/* Section header — always visible */}
      <div className="mt-6 rounded-lg border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        >
          <svg
            className={`h-4 w-4 text-gray-400 shrink-0 transition-transform duration-150 ${open ? "rotate-0" : "-rotate-90"}`}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M2 4l4 4 4-4" />
          </svg>
          <div className="flex-1">
            <span className="text-sm font-semibold text-gray-700">Nexd Templates</span>
            {templates.length > 0 && (
              <span className="ml-2 text-xs text-gray-400">
                {templates.length} templates across {grouped.length} types
              </span>
            )}
          </div>
          {open && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                hasFetched.current = true; // already fetched, force refresh
                loadTemplates(true);
              }}
              disabled={refreshing}
              title="Force refresh template list"
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          )}
        </button>

        {/* Collapsible body */}
        {open && (
          <div className="border-t border-gray-200 bg-white">
            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading Nexd templates…
              </div>
            )}

            {/* Error state */}
            {!loading && error && (
              <div className="px-5 py-6 text-center">
                <p className="text-sm text-red-600">{error}</p>
                <button
                  onClick={() => { hasFetched.current = false; loadTemplates(); }}
                  className="mt-2 text-xs text-gray-500 underline hover:text-gray-700"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Template groups */}
            {!loading && !error && grouped.length > 0 && (
              <div className="divide-y divide-gray-100">
                {grouped.map(([groupName, rows]) => {
                  const isGroupOpen = openGroups.has(groupName);
                  return (
                    <div key={groupName}>
                      {/* Group header */}
                      <button
                        type="button"
                        onClick={() => toggleGroup(groupName)}
                        className="flex w-full items-center gap-2 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        {isGroupOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        )}
                        <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                          {groupName}
                        </span>
                        <span className="text-xs text-gray-400">
                          {rows.length} {rows.length === 1 ? "template" : "templates"}
                        </span>
                      </button>

                      {/* Template table */}
                      {isGroupOpen && (
                        <div className="overflow-x-auto border-t border-gray-100">
                          <table className="w-full border-collapse text-left">
                            {tableHeader}
                            <tbody>
                              {rows.map((t) => {
                                const mapped = allFormats.filter(
                                  (f) => f.nexdTemplateIds.includes(t.id)
                                );
                                return (
                                  <TemplateRow
                                    key={t.id}
                                    template={t}
                                    mappedFormats={mapped}
                                    onMapFormats={setMappingTemplate}
                                    onUnmapFormat={handleUnmapFormat}
                                  />
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && grouped.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                No templates found. Make sure NEXD_API_KEY is set.
              </div>
            )}

            {/* Cache info footer */}
            {cachedAt && (
              <div className="border-t border-gray-100 px-5 py-2 text-right text-xs text-gray-400">
                Cached at {new Date(cachedAt).toLocaleTimeString()} — refreshes every hour
              </div>
            )}
          </div>
        )}
      </div>

      {/* Map Formats Modal */}
      {mappingTemplate && (
        <MapFormatsModal
          template={mappingTemplate}
          allFormats={allFormats}
          onClose={() => setMappingTemplate(null)}
          onSaved={handleMappingSaved}
        />
      )}
    </>
  );
}
