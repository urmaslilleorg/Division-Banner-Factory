"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { Banner } from "@/lib/types";
import type { ClientVariable } from "@/lib/types";
import { FieldConfig, FormatFieldConfig, SlideVariableConfig } from "@/lib/airtable-campaigns";

interface CopyEditorTableProps {
  campaignId: string;
  banners: Banner[];
  fieldConfig: FieldConfig;
  userRole: string;
  /** Per-client variable labels — when provided, column headers show custom labels */
  clientVariables?: ClientVariable[];
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
  banners: initialBanners,
  fieldConfig,
  userRole,
  clientVariables,
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
  // Slide records are already included in the banners prop (fetchBanners with
  // includeSlides=true). We separate them so they are NOT rendered as flat rows.
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
        // Slides not added to parents — they render under their parent
      } else {
        parents.push(b);
      }
    }

    // Sort slides by Slide_Index within each parent
    for (const parentId of Object.keys(slideMap)) {
      slideMap[parentId].sort((a, b) => (a.slideIndex ?? 0) - (b.slideIndex ?? 0));
    }

    return { parentBanners: parents, initialSlidesByParent: slideMap };
  }, [initialBanners]);

  const [banners, setBanners] = useState<Banner[]>(parentBanners);
  const [cellState, setCellState] = useState<CellState | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isReadOnly = userRole === "client_reviewer";

  // Carousel expand/collapse state — collapsed by default (empty Set)
  const [expandedCarousels, setExpandedCarousels] = useState<Set<string>>(new Set());
  // Slides pre-loaded from the banners prop; can be extended by API fetch if needed
  const [slidesByParent, setSlidesByParent] = useState<Record<string, Banner[]>>(initialSlidesByParent);
  const [loadingSlides, setLoadingSlides] = useState<Set<string>>(new Set());

  const toggleCarousel = async (parentId: string) => {
    if (expandedCarousels.has(parentId)) {
      setExpandedCarousels((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
      return;
    }
    setExpandedCarousels((prev) => new Set(Array.from(prev).concat(parentId)));

    // If slides were already loaded from the prop, no API call needed
    if (slidesByParent[parentId] && slidesByParent[parentId].length > 0) return;

    // Fallback: fetch slides from API (e.g. when page loaded without includeSlides)
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
   * Get the active variables for a specific slide of a carousel banner.
   * Falls back to format-level variables if no per-slide config exists.
   */
  const getSlideVariables = (banner: Banner, slideIndex: number): string[] => {
    if (!fieldConfig.formatConfigs) return variables;
    const formatName = banner.format || `${banner.width}x${banner.height}`;
    const formatCfg: FormatFieldConfig | undefined = fieldConfig.formatConfigs[formatName];
    if (!formatCfg?.slides) return formatCfg?.variables ?? variables;
    const slideCfg: SlideVariableConfig | undefined = formatCfg.slides.find((s) => s.index === slideIndex);
    if (!slideCfg) return formatCfg.variables ?? variables;
    return slideCfg.variables;
  };

  /**
   * Build columns for a specific slide based on its variable config.
   */
  const getSlideColumns = (slideVariables: string[]) => {
    const cols: { variable: string; language: string; fieldKey: keyof Banner; label: string }[] = [];
    for (const variable of slideVariables) {
      for (const lang of languages) {
        const fieldKey = VARIABLE_TO_FIELD[variable]?.[lang];
        if (!fieldKey) continue;
        const customLabel = resolveLabel(variable);
        cols.push({
          variable,
          language: lang,
          fieldKey,
          label: languages.length > 1 ? `${customLabel} (${lang})` : customLabel,
        });
      }
    }
    return cols;
  };

  const handleBlur = useCallback(
    async (bannerId: string, fieldKey: keyof Banner, airtableField: string, value: string, currentBanners?: Banner[]) => {
      const bannerList = currentBanners ?? banners;
      const banner = bannerList.find((b) => b.id === bannerId);
      if (!banner) return;
      const originalValue = (banner[fieldKey] as string) || "";
      if (value === originalValue) return;

      setBanners((prev) =>
        prev.map((b) =>
          b.id === bannerId ? { ...b, [fieldKey]: value } : b
        )
      );

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
        setBanners((prev) =>
          prev.map((b) =>
            b.id === bannerId ? { ...b, [fieldKey]: originalValue } : b
          )
        );
        setCellState({ bannerId, field: String(fieldKey), state: "error" });
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCellState(null), 2000);
      }
    },
    [banners]
  );

  // Slide cell blur handler — updates slidesByParent state
  const handleSlideBlur = useCallback(
    async (parentId: string, slideId: string, fieldKey: keyof Banner, airtableField: string, value: string) => {
      const slides = slidesByParent[parentId] ?? [];
      const slide = slides.find((s) => s.id === slideId);
      if (!slide) return;
      const originalValue = (slide[fieldKey] as string) || "";
      if (value === originalValue) return;

      // Optimistic update
      setSlidesByParent((prev) => ({
        ...prev,
        [parentId]: (prev[parentId] ?? []).map((s) =>
          s.id === slideId ? { ...s, [fieldKey]: value } : s
        ),
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
          [parentId]: (prev[parentId] ?? []).map((s) =>
            s.id === slideId ? { ...s, [fieldKey]: originalValue } : s
          ),
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
                if (value.trim()) {
                  (updated as Record<string, unknown>)[colKey] = value.trim();
                }
              }
              return updated;
            })
          );
        }
      } catch {
        // continue
      }
    }

    setIsBulkSaving(false);
    setBulkResult(`Saved ${savedCount} of ${selectedIds.size} banners`);
    setBulkValues({});
    setSelectedIds(new Set());
    setTimeout(() => setBulkResult(null), 3000);
  };

  const handleBulkApply = () => {
    // Check for overwrite warning
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
  const formatLeft = isReadOnly ? 0 : 40; // px — sits right of 40px checkbox column

  return (
    <div className="space-y-4">
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
              <button
                onClick={executeBulkApply}
                className="font-medium underline hover:no-underline"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowBulkOverwriteWarning(false)}
                className="font-medium underline hover:no-underline"
              >
                Cancel
              </button>
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {banners.map((banner) => {
              const isComplete = isBannerRowComplete(banner, variables, languages);
              const isSelected = selectedIds.has(banner.id);
              const isCarousel = banner.bannerType === "Carousel";
              const isExpanded = expandedCarousels.has(banner.id);
              const slides = slidesByParent[banner.id] || [];
              const isLoadingSlides = loadingSlides.has(banner.id);
              const rowBg = isSelected ? "bg-blue-50" : "bg-white";

              return (
                <>
                <tr
                  key={banner.id}
                  className={`hover:bg-gray-50 ${isSelected ? "bg-blue-50" : "bg-white"}`}
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
                        {isCarousel && (
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
                  {/* Copy cells */}
                  {columns.map((col) => {
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
                          col.variable === "H1" && isEmpty && !isReadOnly
                            ? "bg-amber-50"
                            : ""
                        } ${isSuccess ? "bg-emerald-50" : ""} ${isError ? "bg-red-50" : ""}`}
                      >
                        {isReadOnly ? (
                          <span className="block min-h-[28px] text-sm text-gray-700">
                            {value}
                          </span>
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
                </tr>

                {/* Slide child rows — shown when carousel is expanded */}
                {isCarousel && isExpanded && slides.map((slide) => {
                  const slideIdx = slide.slideIndex ?? 1;
                  const slideVars = getSlideVariables(banner, slideIdx);
                  const slideCols = getSlideColumns(slideVars);
                  const isImageOnly = slideVars.length === 0;

                  return (
                    <tr key={slide.id} className="bg-purple-50 border-l-2 border-purple-200">
                      {!isReadOnly && (
                        <td
                          className="sticky z-10 bg-purple-50 px-3 py-2 border-r border-purple-100"
                          style={{ left: checkboxLeft, minWidth: "40px", width: "40px" }}
                        />
                      )}
                      <td
                        className="sticky z-10 bg-purple-50 px-4 py-2 font-mono text-xs text-purple-600 whitespace-nowrap pl-8 border-r border-purple-100"
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
                        const isActive = slideCols.some(
                          (sc) => sc.variable === col.variable && sc.language === col.language
                        );
                        if (!isActive) {
                          return (
                            <td
                              key={`${slide.id}-${col.variable}-${col.language}-empty`}
                              className="px-2 py-1.5 bg-purple-50/60"
                            >
                              <span className="block text-[10px] text-purple-200 italic">—</span>
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
                      <td className="px-3 py-2" />
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
