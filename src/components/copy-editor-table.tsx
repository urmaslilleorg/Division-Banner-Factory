"use client";

import { useState, useCallback, useRef } from "react";
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
  const [banners, setBanners] = useState<Banner[]>(initialBanners);
  const [cellState, setCellState] = useState<CellState | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isReadOnly = userRole === "client_reviewer";

  // Carousel expand/collapse state
  const [expandedCarousels, setExpandedCarousels] = useState<Set<string>>(new Set());
  const [slidesByParent, setSlidesByParent] = useState<Record<string, Banner[]>>({});
  const [loadingSlides, setLoadingSlides] = useState<Set<string>>(new Set());

  const toggleCarousel = async (parentId: string) => {
    if (expandedCarousels.has(parentId)) {
      setExpandedCarousels((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
      return;
    }
    setExpandedCarousels((prev) => new Set(Array.from(prev).concat(parentId)));
    if (slidesByParent[parentId]) return; // already loaded
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
    // Find the format config for this banner's format
    const formatName = banner.format || `${banner.width}x${banner.height}`;
    const formatCfg: FormatFieldConfig | undefined = fieldConfig.formatConfigs[formatName];
    if (!formatCfg?.slides) return formatCfg?.variables ?? variables;
    // slideIndex is 1-based from banner.slideIndex
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

  const handleBulkApply = async () => {
    if (selectedIds.size === 0) return;
    const fieldsToUpdate: Record<string, string> = {};
    for (const [colKey, value] of Object.entries(bulkValues)) {
      if (value.trim()) {
        const airtableField = FIELD_TO_AIRTABLE[colKey];
        if (airtableField) fieldsToUpdate[airtableField] = value.trim();
      }
    }
    if (Object.keys(fieldsToUpdate).length === 0) return;

    setIsBulkSaving(true);
    setBulkResult(null);

    const ids = Array.from(selectedIds);
    let successCount = 0;
    let errorCount = 0;

    // Process in chunks of 10
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      await Promise.all(
        chunk.map(async (bannerId) => {
          try {
            const res = await fetch(`/api/banners/${bannerId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(fieldsToUpdate),
            });
            if (!res.ok) throw new Error();
            successCount++;
            // Update local state
            const fieldKeyUpdates: Partial<Banner> = {};
            for (const [colKey, value] of Object.entries(bulkValues)) {
              if (value.trim()) {
                (fieldKeyUpdates as Record<string, string>)[colKey] = value.trim();
              }
            }
            setBanners((prev) =>
              prev.map((b) =>
                b.id === bannerId ? { ...b, ...fieldKeyUpdates } : b
              )
            );
          } catch {
            errorCount++;
          }
        })
      );
    }

    setIsBulkSaving(false);
    setBulkResult(
      errorCount === 0
        ? `✓ Updated ${successCount} records`
        : `Updated ${successCount}, failed ${errorCount}`
    );
    setTimeout(() => setBulkResult(null), 3000);
    setSelectedIds(new Set());
    setBulkValues({});
  };

  return (
    <div className="space-y-3">
      {/* Bulk action bar — shown when rows are selected */}
      {!isReadOnly && selectedIds.size > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex flex-wrap items-end gap-3">
          <p className="text-sm font-medium text-blue-800 self-center">
            {selectedIds.size} row{selectedIds.size > 1 ? "s" : ""} selected — apply to all:
          </p>
          {columns.map((col) => (
            <div key={`bulk-${col.variable}-${col.language}`} className="space-y-0.5">
              <label className="block text-[10px] font-medium text-blue-700 uppercase tracking-wide">
                {col.label}
              </label>
              <input
                type="text"
                value={bulkValues[String(col.fieldKey)] || ""}
                onChange={(e) =>
                  setBulkValues((prev) => ({
                    ...prev,
                    [String(col.fieldKey)]: e.target.value,
                  }))
                }
                placeholder={`${col.label}…`}
                className="rounded border border-blue-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-36"
              />
            </div>
          ))}
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
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {!isReadOnly && (
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === banners.length && banners.length > 0}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
                  />
                </th>
              )}
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 whitespace-nowrap">
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
              return (
                <>
                <tr
                  key={banner.id}
                  className={`hover:bg-gray-50/50 ${isSelected ? "bg-blue-50/40" : ""}`}
                >
                  {!isReadOnly && (
                    <td className="sticky left-0 z-10 bg-inherit px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(banner.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
                      />
                    </td>
                  )}
                  {/* Format / Banner Name */}
                  <td className="sticky left-0 z-10 bg-inherit px-4 py-2 whitespace-nowrap">
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
                            {isLoadingSlides ? "…" : isExpanded ? `▲ ${slides.length} slides` : "▼ Carousel"}
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
                  const slideIdx = (slide.slideIndex ?? 1);
                  const slideVars = getSlideVariables(banner, slideIdx);
                  const slideCols = getSlideColumns(slideVars);
                  const isImageOnly = slideVars.length === 0;

                  return (
                    <tr key={slide.id} className="bg-purple-50/30 border-l-2 border-purple-200">
                      {!isReadOnly && <td className="px-3 py-2" />}
                      <td className="px-4 py-2 font-mono text-xs text-purple-600 whitespace-nowrap pl-8">
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
                      {/* Render columns aligned to parent header, filling inactive slots with dim cells */}
                      {columns.map((col) => {
                        const isActive = slideCols.some(
                          (sc) => sc.variable === col.variable && sc.language === col.language
                        );
                        if (!isActive) {
                          return (
                            <td
                              key={`${slide.id}-${col.variable}-${col.language}-empty`}
                              className="px-2 py-1.5 bg-gray-50/60"
                            >
                              <span className="block text-[10px] text-gray-300 italic">—</span>
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
                                    : "border-gray-200 bg-white"
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
