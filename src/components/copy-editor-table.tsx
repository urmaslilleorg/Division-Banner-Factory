"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { Banner } from "@/lib/types";
import type { ClientVariable } from "@/lib/types";
import { FieldConfig, FormatFieldConfig, SlideVariableConfig } from "@/lib/airtable-campaigns";
import AddFormatModal from "@/components/add-format-modal";

interface CopyEditorTableProps {
  campaignId: string;
  banners: Banner[];
  fieldConfig: FieldConfig;
  userRole: string;
  /** Per-client variable labels — when provided, column headers show custom labels */
  clientVariables?: ClientVariable[];
  /** Client-linked format record IDs — used to filter the Add Format picker */
  clientFormatIds?: string[];
}

type SaveState = "idle" | "saving" | "success" | "error";

interface CellState {
  bannerId: string;
  field: string;
  state: SaveState;
}

// Map variable names to Banner field keys
const VARIABLE_TO_FIELD: Record<string, Record<string, keyof Banner>> = {
  H1: { ET: "h1ET", EN: "h1EN" },
  H2: { ET: "h2ET", EN: "h2EN" },
  H3: { ET: "h3ET", EN: "h3EN" },
  CTA: { ET: "ctaET", EN: "ctaEN" },
  Price_Tag: { ET: "priceTag", EN: "priceTag" },
  Illustration: { ET: "illustration", EN: "illustration" },
};

// Map Banner field key → Airtable field name
const FIELD_TO_AIRTABLE: Record<string, string> = {
  h1ET: "H1_ET", h1EN: "H1_EN",
  h2ET: "H2_ET", h2EN: "H2_EN",
  h3ET: "H3_ET", h3EN: "H3_EN",
  ctaET: "CTA_ET", ctaEN: "CTA_EN",
  priceTag: "Price_Tag",
  illustration: "Illustration",
};

function isBannerRowComplete(
  banner: Banner,
  variables: string[],
  languages: string[]
): boolean {
  for (const variable of variables) {
    for (const lang of languages) {
      const fieldKey = VARIABLE_TO_FIELD[variable]?.[lang];
      if (!fieldKey) continue;
      const value = banner[fieldKey] as string | undefined;
      if (!value || value.trim() === "") return false;
    }
  }
  return true;
}

export default function CopyEditorTable({
  campaignId,
  banners: initialBanners,
  fieldConfig: initialFieldConfig,
  userRole,
  clientVariables,
  clientFormatIds = [],
}: CopyEditorTableProps) {
  /** Resolve display label for a variable slot, using client-specific label if available */
  const resolveLabel = (slot: string) => {
    if (clientVariables && clientVariables.length > 0) {
      const cv = clientVariables.find((v) => v.slot === slot);
      if (cv) return cv.label;
    }
    return slot;
  };

  // ── Split banners into parent rows and pre-grouped slides ──────────────────
  const { parentBanners, initialSlidesByParent } = useMemo(() => {
    const parents: Banner[] = [];
    const slideMap: Record<string, Banner[]> = {};
    for (const b of initialBanners) {
      if (b.bannerType === "Slide") {
        const parentId = b.parentBannerIds?.[0];
        if (parentId) {
          if (!slideMap[parentId]) slideMap[parentId] = [];
          slideMap[parentId].push(b);
        }
      } else {
        parents.push(b);
      }
    }
    for (const parentId of Object.keys(slideMap)) {
      slideMap[parentId].sort((a, b) => (a.slideIndex ?? 0) - (b.slideIndex ?? 0));
    }
    return { parentBanners: parents, initialSlidesByParent: slideMap };
  }, [initialBanners]);

  const [banners, setBanners] = useState<Banner[]>(parentBanners);
  const [fieldConfig, setFieldConfig] = useState<FieldConfig>(initialFieldConfig);
  const [showAddFormat, setShowAddFormat] = useState(false);
  const [cellState, setCellState] = useState<CellState | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isReadOnly = userRole === "client_reviewer";
  const canDelete = ["division_admin", "division_designer"].includes(userRole);

  // Carousel expand/collapse state — collapsed by default
  const [expandedCarousels, setExpandedCarousels] = useState<Set<string>>(new Set());
  const [slidesByParent, setSlidesByParent] = useState<Record<string, Banner[]>>(initialSlidesByParent);
  const [loadingSlides, setLoadingSlides] = useState<Set<string>>(new Set());

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Per-format gear icon edit state — stores the format name being edited
  const [editingFormatName, setEditingFormatName] = useState<string | null>(null);

  const toggleCarousel = async (parentId: string) => {
    if (expandedCarousels.has(parentId)) {
      setExpandedCarousels((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
      return;
    }
    setExpandedCarousels((prev) => new Set(Array.from(prev).concat(parentId)));
    if (slidesByParent[parentId] && slidesByParent[parentId].length > 0) return;
    setLoadingSlides((prev) => new Set(Array.from(prev).concat(parentId)));
    try {
      const res = await fetch(`/api/banners?parentId=${parentId}`);
      const data = await res.json();
      setSlidesByParent((prev) => ({ ...prev, [parentId]: Array.isArray(data.banners) ? data.banners : [] }));
    } catch {
      setSlidesByParent((prev) => ({ ...prev, [parentId]: [] }));
    } finally {
      setLoadingSlides((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
    }
  };

  const handleDelete = async (bannerId: string) => {
    setDeleteError(null);
    setDeletingId(bannerId);
    try {
      const res = await fetch(`/api/banners/${bannerId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Delete failed (${res.status})`);
      }
      setBanners((prev) => prev.filter((b) => b.id !== bannerId));
      setSlidesByParent((prev) => {
        const next = { ...prev };
        delete next[bannerId];
        return next;
      });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
      setTimeout(() => setDeleteError(null), 4000);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSlideDelete = async (parentId: string, slideId: string) => {
    setDeleteError(null);
    setDeletingId(slideId);
    try {
      const res = await fetch(`/api/banners/${slideId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Delete failed (${res.status})`);
      }
      // Remove the slide from local state
      setSlidesByParent((prev) => ({
        ...prev,
        [parentId]: (prev[parentId] ?? []).filter((s) => s.id !== slideId),
      }));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
      setTimeout(() => setDeleteError(null), 4000);
    } finally {
      setDeletingId(null);
    }
  };

  // Bulk override state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkValues, setBulkValues] = useState<Record<string, string>>({});
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [bulkOverwriteCount, setBulkOverwriteCount] = useState(0);
  const [showBulkOverwriteWarning, setShowBulkOverwriteWarning] = useState(false);

  const { variables, languages } = fieldConfig;

  // Build column list: for each variable × language
  const columns: { variable: string; language: string; fieldKey: keyof Banner; label: string }[] = [];
  for (const variable of variables) {
    for (const lang of languages) {
      const fieldKey = VARIABLE_TO_FIELD[variable]?.[lang];
      if (!fieldKey) continue;
      const customLabel = resolveLabel(variable);
      columns.push({
        variable,
        language: lang,
        fieldKey,
        label: languages.length > 1 ? `${customLabel} (${lang})` : customLabel,
      });
    }
  }

  /**
   * Resolve the formatConfigs lookup key for a banner.
   * Priority: banner.formatName (Format_Name field) > banner.format (WxH dimensions).
   * The formatConfigs keys are Format_Name values like "Display_Horizontal".
   * Legacy banners without Format_Name fall back to dimensions; they will not lock
   * (all columns editable) until re-generated with the updated create route.
   */
  const resolveFormatKey = (banner: Banner): string =>
    banner.formatName || banner.format || `${banner.width}x${banner.height}`;

  /**
   * Get the active variables for a banner's format from fieldConfig.
   * Returns the full variables list if no format-specific config is found.
   */
  const getFormatVariables = (banner: Banner): string[] => {
    if (!fieldConfig.formatConfigs) return variables;
    const key = resolveFormatKey(banner);
    const formatCfg: FormatFieldConfig | undefined = fieldConfig.formatConfigs[key];
    if (!formatCfg) return variables;
    return formatCfg.variables ?? variables;
  };

  /**
   * Get the active variables for a specific slide of a carousel banner.
   */
  const getSlideVariables = (banner: Banner, slideIndex: number): string[] => {
    if (!fieldConfig.formatConfigs) return variables;
    const key = resolveFormatKey(banner);
    const formatCfg: FormatFieldConfig | undefined = fieldConfig.formatConfigs[key];
    if (!formatCfg?.slides) return formatCfg?.variables ?? variables;
    const slideCfg: SlideVariableConfig | undefined = formatCfg.slides.find((s) => s.index === slideIndex);
    if (!slideCfg) return formatCfg.variables ?? variables;
    return slideCfg.variables;
  };

  const handleBlur = useCallback(
    async (bannerId: string, fieldKey: keyof Banner, airtableField: string, value: string, currentBanners?: Banner[]) => {
      const bannerList = currentBanners ?? banners;
      const banner = bannerList.find((b) => b.id === bannerId);
      if (!banner) return;
      const originalValue = (banner[fieldKey] as string) || "";
      if (value === originalValue) return;
      setBanners((prev) => prev.map((b) => b.id === bannerId ? { ...b, [fieldKey]: value } : b));
      setCellState({ bannerId, field: String(fieldKey), state: "saving" });
      try {
        const res = await fetch(`/api/banners/${bannerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [airtableField]: value }),
        });
        if (!res.ok) throw new Error("Save failed");
        setCellState({ bannerId, field: String(fieldKey), state: "success" });
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCellState(null), 1500);
      } catch {
        setBanners((prev) => prev.map((b) => b.id === bannerId ? { ...b, [fieldKey]: originalValue } : b));
        setCellState({ bannerId, field: String(fieldKey), state: "error" });
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCellState(null), 2000);
      }
    },
    [banners]
  );

  const handleSlideBlur = useCallback(
    async (parentId: string, slideId: string, fieldKey: keyof Banner, airtableField: string, value: string) => {
      const slides = slidesByParent[parentId] ?? [];
      const slide = slides.find((s) => s.id === slideId);
      if (!slide) return;
      const originalValue = (slide[fieldKey] as string) || "";
      if (value === originalValue) return;
      setSlidesByParent((prev) => ({
        ...prev,
        [parentId]: (prev[parentId] ?? []).map((s) => s.id === slideId ? { ...s, [fieldKey]: value } : s),
      }));
      setCellState({ bannerId: slideId, field: String(fieldKey), state: "saving" });
      try {
        const res = await fetch(`/api/banners/${slideId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [airtableField]: value }),
        });
        if (!res.ok) throw new Error("Save failed");
        setCellState({ bannerId: slideId, field: String(fieldKey), state: "success" });
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCellState(null), 1500);
      } catch {
        setSlidesByParent((prev) => ({
          ...prev,
          [parentId]: (prev[parentId] ?? []).map((s) => s.id === slideId ? { ...s, [fieldKey]: originalValue } : s),
        }));
        setCellState({ bannerId: slideId, field: String(fieldKey), state: "error" });
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCellState(null), 2000);
      }
    },
    [slidesByParent]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === banners.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(banners.map((b) => b.id)));
    }
  };

  const executeBulkApply = async () => {
    const fieldsToUpdate: Record<string, string> = {};
    for (const [colKey, value] of Object.entries(bulkValues)) {
      if (value.trim()) {
        const airtableField = FIELD_TO_AIRTABLE[colKey];
        if (airtableField) fieldsToUpdate[airtableField] = value.trim();
      }
    }
    if (Object.keys(fieldsToUpdate).length === 0) return;
    setShowBulkOverwriteWarning(false);
    setIsBulkSaving(true);
    setBulkResult(null);
    let savedCount = 0;
    for (const bannerId of Array.from(selectedIds)) {
      try {
        const res = await fetch(`/api/banners/${bannerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fieldsToUpdate),
        });
        if (res.ok) {
          savedCount++;
          setBanners((prev) =>
            prev.map((b) => {
              if (b.id !== bannerId) return b;
              const updated = { ...b };
              for (const [colKey, value] of Object.entries(bulkValues)) {
                if (value.trim()) (updated as Record<string, unknown>)[colKey] = value.trim();
              }
              return updated;
            })
          );
        }
      } catch { /* continue */ }
    }
    setIsBulkSaving(false);
    setBulkResult(`Saved ${savedCount} of ${selectedIds.size} banners`);
    setBulkValues({});
    setSelectedIds(new Set());
    setTimeout(() => setBulkResult(null), 3000);
  };

  const handleBulkApply = () => {
    let overwriteCount = 0;
    for (const bannerId of Array.from(selectedIds)) {
      const banner = banners.find((b) => b.id === bannerId);
      if (!banner) continue;
      for (const [colKey, value] of Object.entries(bulkValues)) {
        if (!value.trim()) continue;
        const existing = (banner as unknown as Record<string, unknown>)[colKey] as string | undefined;
        if (existing && existing.trim() !== "") overwriteCount++;
      }
    }
    if (overwriteCount > 0) {
      setBulkOverwriteCount(overwriteCount);
      setShowBulkOverwriteWarning(true);
    } else {
      executeBulkApply();
    }
  };

  // ── Sticky column left offsets ─────────────────────────────────────────────
  const checkboxLeft = 0;
  const formatLeft = isReadOnly ? 0 : 40;

  // Handle successful format addition
  const handleAddFormatSuccess = useCallback(
    (newBanners: Banner[], updatedFieldConfig: FieldConfig) => {
      setFieldConfig(updatedFieldConfig);
      // Add new parent banners (non-Slide) to the table
      const newParents = newBanners.filter((b) => b.bannerType !== "Slide");
      if (newParents.length > 0) {
        setBanners((prev) => [...prev, ...newParents]);
      }
      // Add slide children to slidesByParent map
      const newSlides = newBanners.filter((b) => b.bannerType === "Slide");
      if (newSlides.length > 0) {
        setSlidesByParent((prev) => {
          const next = { ...prev };
          for (const slide of newSlides) {
            const parentId = slide.parentBannerIds?.[0];
            if (parentId) {
              next[parentId] = [...(next[parentId] ?? []), slide].sort(
                (a, b) => (a.slideIndex ?? 0) - (b.slideIndex ?? 0)
              );
            }
          }
          return next;
        });
      }
      setShowAddFormat(false);
      // Full page reload so the server component re-fetches fresh Airtable data
      // and the client component initialises with the new banner rows.
      window.location.reload();
    },
    []
  );

  // Total number of data columns (for colspan on carousel header row)
  // checkbox(1) + format(1) + lang(1) + status(1) + copy columns + ready(1) + delete(1 if canDelete)
  const totalCols =
    (isReadOnly ? 0 : 1) + // checkbox
    1 + // format
    1 + // lang
    1 + // status
    columns.length + // copy columns
    1 + // ready
    (canDelete ? 1 : 0); // delete

  return (
    <div className="space-y-4">
      {/* Add Format Modal */}
      {showAddFormat && (
        <AddFormatModal
          campaignId={campaignId}
          fieldConfig={fieldConfig}
          clientFormatIds={clientFormatIds}
          clientVariables={clientVariables?.map((cv) => ({ slot: cv.slot, label: cv.label }))}
          onClose={() => setShowAddFormat(false)}
          onSuccess={handleAddFormatSuccess}
        />
      )}

      {/* Toolbar: Add Format button (admin/designer only) */}
      {!isReadOnly && ["division_admin", "division_designer"].includes(userRole) && (
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowAddFormat(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Add Format
          </button>
        </div>
      )}

      {/* Delete error toast */}
      {deleteError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      {/* Bulk edit toolbar */}
      {!isReadOnly && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <span className="text-xs font-medium text-blue-700">
            {selectedIds.size} selected
          </span>
          {columns.map((col) => (
            <div key={`bulk-${col.variable}-${col.language}`} className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wider text-blue-500">
                {col.label}
              </label>
              <input
                type="text"
                value={bulkValues[String(col.fieldKey)] ?? ""}
                onChange={(e) =>
                  setBulkValues((prev) => ({ ...prev, [String(col.fieldKey)]: e.target.value }))
                }
                placeholder={`${col.variable}…`}
                className="w-32 rounded border border-blue-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          ))}
          {showBulkOverwriteWarning && (
            <div className="flex items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              <span>Will overwrite {bulkOverwriteCount} existing value{bulkOverwriteCount !== 1 ? "s" : ""}.</span>
              <button onClick={executeBulkApply} className="font-medium underline hover:no-underline">Confirm</button>
              <button onClick={() => setShowBulkOverwriteWarning(false)} className="font-medium underline hover:no-underline">Cancel</button>
            </div>
          )}
          <button
            onClick={handleBulkApply}
            disabled={isBulkSaving}
            className="self-end rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {isBulkSaving ? "Saving…" : "Apply to selected"}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="self-end rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
          >
            Clear
          </button>
          {bulkResult && (
            <p className="self-end text-xs font-medium text-emerald-700">{bulkResult}</p>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full divide-y divide-gray-100 text-sm" style={{ minWidth: "max-content" }}>
          <thead className="bg-gray-50">
            <tr>
              {!isReadOnly && (
                <th
                  className="sticky z-20 bg-gray-50 px-3 py-3 border-r border-gray-200"
                  style={{ left: checkboxLeft, minWidth: "40px", width: "40px" }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.size === banners.length && banners.length > 0}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
                  />
                </th>
              )}
              <th
                className="sticky z-20 bg-gray-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 whitespace-nowrap border-r border-gray-200"
                style={{ left: formatLeft, minWidth: "200px" }}
              >
                Format
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                Lang
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                Status
              </th>
              {columns.map((col) => (
                <th
                  key={`${col.variable}-${col.language}`}
                  className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 min-w-[160px]"
                >
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                Ready
              </th>
              {canDelete && (
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 w-10" />
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {banners.map((banner) => {
              const formatVars = getFormatVariables(banner);
              const isComplete = isBannerRowComplete(banner, formatVars, languages);
              const isSelected = selectedIds.has(banner.id);
              const isCarousel = banner.bannerType === "Carousel";
              const isExpanded = expandedCarousels.has(banner.id);
              const slides = slidesByParent[banner.id] || [];
              const isLoadingSlides = loadingSlides.has(banner.id);
              const isDeleting = deletingId === banner.id;
              const rowBg = isSelected ? "bg-blue-50" : "bg-white";

              return (
                <>
                {/* ── Carousel parent: header-only row ── */}
                {isCarousel ? (
                  <tr
                    key={banner.id}
                    className={`hover:bg-gray-50 ${isSelected ? "bg-blue-50" : "bg-white"} ${isDeleting ? "opacity-50" : ""}`}
                  >
                    {!isReadOnly && (
                      <td
                        className={`sticky z-10 px-3 py-2 border-r border-gray-200 ${rowBg}`}
                        style={{ left: checkboxLeft, minWidth: "40px", width: "40px" }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(banner.id)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
                        />
                      </td>
                    )}
                    {/* Format cell with expand/collapse button */}
                    <td
                      className={`sticky z-10 px-4 py-2 whitespace-nowrap border-r border-gray-200 ${rowBg}`}
                      style={{ left: formatLeft, minWidth: "200px" }}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-gray-600">
                            {banner.format || `${banner.width}×${banner.height}`}
                          </span>
                          {canDelete && banner.formatName && (
                            <button
                              onClick={() => setEditingFormatName(
                                editingFormatName === banner.formatName ? null : banner.formatName
                              )}
                              title="Edit format variables"
                              className={`rounded p-0.5 transition-colors ${
                                editingFormatName === banner.formatName
                                  ? "text-gray-900 bg-gray-200"
                                  : "text-gray-300 hover:text-gray-600 hover:bg-gray-100"
                              }`}
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => toggleCarousel(banner.id)}
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                            title={isExpanded ? "Collapse slides" : "Expand slides"}
                          >
                            {isLoadingSlides
                              ? "…"
                              : isExpanded
                              ? `▲ ${slides.length} slide${slides.length !== 1 ? "s" : ""}`
                              : `▶ ${slides.length} slide${slides.length !== 1 ? "s" : ""} [Carousel]`}
                          </button>
                        </div>
                        {banner.bannerName && (
                          <span className="font-mono text-[10px] text-gray-400 max-w-[220px] truncate" title={banner.bannerName}>
                            {banner.bannerName}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Span remaining columns with a muted "expand to edit slides" hint */}
                    <td
                      colSpan={totalCols - (isReadOnly ? 1 : 2)}
                      className="px-4 py-2 text-xs text-gray-400 italic"
                    >
                      {isExpanded
                        ? `${slides.length} slide${slides.length !== 1 ? "s" : ""} — edit copy in slide rows below`
                        : "Click ▶ to expand slides and edit copy"}
                    </td>
                    {/* Delete button for carousel parent */}
                    {canDelete && (
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete this Carousel banner and all ${slides.length} slide${slides.length !== 1 ? "s" : ""}?`)) {
                              handleDelete(banner.id);
                            }
                          }}
                          disabled={isDeleting}
                          title="Delete carousel and all slides"
                          className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                        >
                          {isDeleting ? (
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          )}
                        </button>
                      </td>
                    )}
                  </tr>
                ) : (
                  /* ── Standard/Specific banner: full editable row ── */
                  <tr
                    key={banner.id}
                    className={`hover:bg-gray-50 ${isSelected ? "bg-blue-50" : "bg-white"} ${isDeleting ? "opacity-50" : ""}`}
                  >
                    {!isReadOnly && (
                      <td
                        className={`sticky z-10 px-3 py-2 border-r border-gray-200 ${rowBg}`}
                        style={{ left: checkboxLeft, minWidth: "40px", width: "40px" }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(banner.id)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
                        />
                      </td>
                    )}
                    {/* Format / Banner Name */}
                    <td
                      className={`sticky z-10 px-4 py-2 whitespace-nowrap border-r border-gray-200 ${rowBg}`}
                      style={{ left: formatLeft, minWidth: "200px" }}
                    >
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-gray-600">
                            {banner.format || `${banner.width}×${banner.height}`}
                          </span>
                          {canDelete && banner.formatName && (
                            <button
                              onClick={() => setEditingFormatName(
                                editingFormatName === banner.formatName ? null : banner.formatName
                              )}
                              title="Edit format variables"
                              className={`rounded p-0.5 transition-colors ${
                                editingFormatName === banner.formatName
                                  ? "text-gray-900 bg-gray-200"
                                  : "text-gray-300 hover:text-gray-600 hover:bg-gray-100"
                              }`}
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {banner.bannerName && (
                          <span className="font-mono text-[10px] text-gray-400 max-w-[220px] truncate" title={banner.bannerName}>
                            {banner.bannerName}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Language */}
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          banner.language === "ET"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {banner.language}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                        {banner.status}
                      </span>
                    </td>
                    {/* Copy cells — locked for inactive variables (Task 3) */}
                    {columns.map((col) => {
                      const isActive = formatVars.includes(col.variable);
                      if (!isActive) {
                        // Inactive variable — greyed out, not editable
                        return (
                          <td
                            key={`${banner.id}-${col.variable}-${col.language}-locked`}
                            className="px-2 py-1.5 bg-gray-100"
                          >
                            <span className="block text-[11px] text-gray-300 select-none">—</span>
                          </td>
                        );
                      }
                      const value = (banner[col.fieldKey] as string) || "";
                      const isEmpty = value.trim() === "";
                      const isSaving =
                        cellState?.bannerId === banner.id &&
                        cellState.field === String(col.fieldKey) &&
                        cellState.state === "saving";
                      const isSuccess =
                        cellState?.bannerId === banner.id &&
                        cellState.field === String(col.fieldKey) &&
                        cellState.state === "success";
                      const isError =
                        cellState?.bannerId === banner.id &&
                        cellState.field === String(col.fieldKey) &&
                        cellState.state === "error";
                      return (
                        <td
                          key={`${banner.id}-${col.variable}-${col.language}`}
                          className={`px-2 py-1.5 transition-colors ${
                            col.variable === "H1" && isEmpty && !isReadOnly ? "bg-amber-50" : ""
                          } ${isSuccess ? "bg-emerald-50" : ""} ${isError ? "bg-red-50" : ""}`}
                        >
                          {isReadOnly ? (
                            <span className="block min-h-[28px] text-sm text-gray-700">{value}</span>
                          ) : (
                            <input
                              type="text"
                              defaultValue={value}
                              disabled={isSaving}
                              onBlur={(e) =>
                                handleBlur(
                                  banner.id,
                                  col.fieldKey,
                                  FIELD_TO_AIRTABLE[String(col.fieldKey)] || String(col.fieldKey),
                                  e.target.value
                                )
                              }
                              placeholder={col.variable === "H1" ? "Required" : ""}
                              className={`w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 ${
                                isSaving
                                  ? "border-gray-200 bg-gray-50 text-gray-400"
                                  : isSuccess
                                  ? "border-emerald-300 bg-emerald-50"
                                  : isError
                                  ? "border-red-300 bg-red-50"
                                  : col.variable === "H1" && isEmpty
                                  ? "border-amber-300 bg-amber-50"
                                  : "border-gray-200 bg-white"
                              }`}
                            />
                          )}
                        </td>
                      );
                    })}
                    {/* Ready badge */}
                    <td className="px-3 py-2">
                      {isComplete ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          Ready ✓
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                          Incomplete
                        </span>
                      )}
                    </td>
                    {/* Delete button — admin/designer only */}
                    {canDelete && (
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => {
                            if (window.confirm("Delete this banner?")) handleDelete(banner.id);
                          }}
                          disabled={isDeleting}
                          title="Delete banner"
                          className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                        >
                          {isDeleting ? (
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          )}
                        </button>
                      </td>
                    )}
                  </tr>
                )}

                {/* ── Inline format edit panel — shown when gear icon is clicked ── */}
                {canDelete && banner.formatName && editingFormatName === banner.formatName && (
                  <FormatEditRow
                    key={`edit-${banner.id}`}
                    formatName={banner.formatName}
                    fieldConfig={fieldConfig}
                    campaignId={campaignId}
                    totalCols={totalCols}
                    onSave={(updatedConfig) => {
                      setFieldConfig(updatedConfig);
                      setEditingFormatName(null);
                    }}
                    onClose={() => setEditingFormatName(null)}
                  />
                )}

                {/* ── Slide child rows — shown when carousel is expanded ── */}
                {isCarousel && isExpanded && slides.map((slide) => {
                  const slideIdx = slide.slideIndex ?? 1;
                  const slideVars = getSlideVariables(banner, slideIdx);
                  const slideIsDeleting = deletingId === slide.id;
                  const isImageOnly = slideVars.length === 0;
                  const slideIsSelected = selectedIds.has(slide.id);
                  const slideBg = slideIsSelected ? "bg-blue-50" : "bg-purple-50";

                  return (
                    <tr key={slide.id} className={`border-l-2 border-purple-200 ${slideIsDeleting ? "opacity-50" : ""} ${slideIsSelected ? "bg-blue-50" : "bg-purple-50"}`}>
                      {/* Checkbox for slide row */}
                      {!isReadOnly && (
                        <td
                          className={`sticky z-10 px-3 py-2 border-r border-purple-100 ${slideBg}`}
                          style={{ left: checkboxLeft, minWidth: "40px", width: "40px" }}
                        >
                          <input
                            type="checkbox"
                            checked={slideIsSelected}
                            onChange={() => toggleSelect(slide.id)}
                            className="h-3.5 w-3.5 rounded border-purple-300 text-purple-700"
                          />
                        </td>
                      )}
                      <td
                        className={`sticky z-10 px-4 py-2 font-mono text-xs text-purple-600 whitespace-nowrap pl-8 border-r border-purple-100 ${slideBg}`}
                        style={{ left: formatLeft, minWidth: "200px" }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>↳ Slide {slideIdx}</span>
                          {isImageOnly && (
                            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-medium text-purple-500">
                              image only
                            </span>
                          )}
                        </div>
                        {slide.figmaFrame && (
                          <span className="block text-[9px] text-purple-400 mt-0.5">
                            {slide.figmaFrame.split("_").pop()}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700">
                          {slide.language}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                          {slide.status}
                        </span>
                      </td>
                      {columns.map((col) => {
                        const isActive = slideVars.includes(col.variable);
                        if (!isActive) {
                          return (
                            <td
                              key={`${slide.id}-${col.variable}-${col.language}-locked`}
                              className="px-2 py-1.5 bg-gray-100"
                            >
                              <span className="block text-[11px] text-gray-300 select-none">—</span>
                            </td>
                          );
                        }
                        const value = (slide[col.fieldKey] as string) || "";
                        const isSaving =
                          cellState?.bannerId === slide.id &&
                          cellState.field === String(col.fieldKey) &&
                          cellState.state === "saving";
                        const isSuccess =
                          cellState?.bannerId === slide.id &&
                          cellState.field === String(col.fieldKey) &&
                          cellState.state === "success";
                        const isError =
                          cellState?.bannerId === slide.id &&
                          cellState.field === String(col.fieldKey) &&
                          cellState.state === "error";
                        return (
                          <td
                            key={`${slide.id}-${col.variable}-${col.language}`}
                            className={`px-2 py-1.5 transition-colors ${isSuccess ? "bg-emerald-50" : ""} ${isError ? "bg-red-50" : ""}`}
                          >
                            {isReadOnly ? (
                              <span className="block min-h-[28px] text-sm text-gray-700">{value}</span>
                            ) : (
                              <input
                                type="text"
                                defaultValue={value}
                                disabled={isSaving}
                                onBlur={(e) =>
                                  handleSlideBlur(
                                    banner.id,
                                    slide.id,
                                    col.fieldKey,
                                    FIELD_TO_AIRTABLE[String(col.fieldKey)] || String(col.fieldKey),
                                    e.target.value
                                  )
                                }
                                className={`w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400 ${
                                  isSaving
                                    ? "border-gray-200 bg-gray-50 text-gray-400"
                                    : isSuccess
                                    ? "border-emerald-300 bg-emerald-50"
                                    : isError
                                    ? "border-red-300 bg-red-50"
                                    : "border-purple-200 bg-white"
                                }`}
                              />
                            )}
                          </td>
                        );
                      })}
                      {/* Ready cell placeholder */}
                      <td className="px-3 py-2" />
                      {/* Delete slide button */}
                      {canDelete && (
                        <td className="px-2 py-2 text-right">
                          <button
                            onClick={() => {
                              if (window.confirm(`Delete Slide ${slideIdx}?`)) {
                                handleSlideDelete(banner.id, slide.id);
                              }
                            }}
                            disabled={slideIsDeleting}
                            title={`Delete Slide ${slideIdx}`}
                            className="rounded p-1 text-purple-200 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                          >
                            {slideIsDeleting ? (
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            )}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── FormatEditRow ─────────────────────────────────────────────────────────────
/**
 * Inline edit panel rendered as a full-width <tr> below the format row.
 * Lets admin/designer update variables and mode for an existing format.
 * Saves by PATCHing Field_Config on the campaign record.
 */

const VARIABLE_OPTIONS_EDIT = [
  { value: "H1", label: "H1" },
  { value: "H2", label: "H2" },
  { value: "H3", label: "H3" },
  { value: "CTA", label: "CTA" },
  { value: "Price_Tag", label: "Price Tag" },
  { value: "Illustration", label: "Illustration" },
];

type EditFormatMode = "default" | "specific" | "carousel";

interface FormatEditRowProps {
  formatName: string;
  fieldConfig: FieldConfig;
  campaignId: string;
  totalCols: number;
  onSave: (updatedConfig: FieldConfig) => void;
  onClose: () => void;
}

function FormatEditRow({
  formatName,
  fieldConfig,
  campaignId,
  totalCols,
  onSave,
  onClose,
}: FormatEditRowProps) {
  const existingCfg = fieldConfig.formatConfigs?.[formatName];
  const [variables, setVariables] = useState<string[]>(
    existingCfg?.variables ?? fieldConfig.variables ?? ["H1", "CTA"]
  );
  const [mode, setMode] = useState<EditFormatMode>(
    (existingCfg?.mode as EditFormatMode) ?? "default"
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggleVar = (v: string) => {
    setVariables((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const updatedFormatConfigs = {
        ...(fieldConfig.formatConfigs ?? {}),
        [formatName]: {
          ...(existingCfg ?? {}),
          variables,
          mode,
        },
      };
      // Merge all variables across all format configs
      const allVariables = Array.from(
        new Set(
          Object.values(updatedFormatConfigs).flatMap(
            (cfg) => (cfg as { variables?: string[] }).variables ?? []
          )
        )
      );
      const updatedFieldConfig: FieldConfig = {
        ...fieldConfig,
        variables: Array.from(new Set([...(fieldConfig.variables ?? []), ...allVariables])),
        formatConfigs: updatedFormatConfigs,
      };

      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Field_Config: JSON.stringify(updatedFieldConfig) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      onSave(updatedFieldConfig);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="bg-gray-50 border-t border-b border-gray-200">
      <td colSpan={totalCols} className="px-4 py-3">
        <div className="flex flex-wrap items-end gap-4">
          {/* Format name label */}
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-semibold text-gray-700">{formatName}</span>
          </div>

          {/* Variable toggles */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mr-1">Variables:</span>
            {VARIABLE_OPTIONS_EDIT.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => toggleVar(v.value)}
                className={`rounded border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  variables.includes(v.value)
                    ? "border-purple-600 bg-purple-600 text-white"
                    : "border-gray-200 bg-white text-gray-400 hover:bg-gray-50"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Mode selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mr-1">Mode:</span>
            {(["default", "specific", "carousel"] as EditFormatMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded border px-2 py-0.5 text-[10px] font-medium capitalize transition-colors ${
                  mode === m
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-400 hover:bg-gray-50"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-auto">
            {saveError && (
              <span className="text-[10px] text-red-600">{saveError}</span>
            )}
            <button
              onClick={onClose}
              className="rounded border border-gray-200 px-3 py-1 text-[10px] font-medium text-gray-500 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded border border-gray-900 bg-gray-900 px-3 py-1 text-[10px] font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
