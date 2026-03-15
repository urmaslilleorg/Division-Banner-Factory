"use client";
/**
 * AddFormatModal
 *
 * A slide-in panel that lets users add a new format to an existing campaign
 * directly from the Copy & Assets tab.
 *
 * Flow:
 *  1. Fetch client-linked formats via /api/formats (filtered by formatIds prop)
 *  2. User picks a format from FormatPicker (already-added formats are disabled)
 *  3. User configures variables + mode (+ slides if carousel)
 *  4. "Add to campaign" calls POST /api/campaigns/[id]/generate-banners with
 *     the targeted format body, which also updates Field_Config
 *  5. onSuccess(newBanners, updatedFieldConfig) is called so the parent can
 *     refresh the table without a full page reload
 */
import { useState, useEffect, useCallback } from "react";
import type { AirtableFormat, FieldConfig } from "@/lib/airtable-campaigns";
import type { Banner } from "@/lib/types";
import FormatPicker from "@/components/format-picker";

const VARIABLE_OPTIONS = [
  { value: "H1", label: "H1" },
  { value: "H2", label: "H2" },
  { value: "H3", label: "H3" },
  { value: "CTA", label: "CTA" },
  { value: "Price_Tag", label: "Price Tag" },
  { value: "Illustration", label: "Illustration" },
  { value: "Image", label: "Image" },
];

type FormatMode = "default" | "specific" | "carousel";

interface SlideConfig {
  index: number;
  variables: string[];
}

interface FormatConfig {
  variables: string[];
  mode: FormatMode;
  slideCount: number;
  slides: SlideConfig[];
}

function buildEmptySlides(count: number, vars: string[]): SlideConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    variables: [...vars],
  }));
}

interface AddFormatModalProps {
  campaignId: string;
  fieldConfig: FieldConfig;
  /** Client-linked format record IDs — used to filter the picker */
  clientFormatIds: string[];
  /** Client-specific variable labels — overrides VARIABLE_OPTIONS display labels */
  clientVariables?: Array<{ slot: string; label: string }>;
  onClose: () => void;
  onSuccess: (newBanners: Banner[], updatedFieldConfig: FieldConfig) => void;
}

export default function AddFormatModal({
  campaignId,
  fieldConfig,
  clientFormatIds,
  clientVariables,
  onClose,
  onSuccess,
}: AddFormatModalProps) {
  // Build variable options from clientVariables if provided, else fall back to defaults
  const variableOptions = (clientVariables && clientVariables.length > 0)
    ? clientVariables.map((cv) => ({ value: cv.slot, label: cv.label || cv.slot }))
    : VARIABLE_OPTIONS;
  const [formats, setFormats] = useState<AirtableFormat[]>([]);
  const [loadingFormats, setLoadingFormats] = useState(true);
  const [selectedFormatIds, setSelectedFormatIds] = useState<string[]>([]);
  const [formatConfig, setFormatConfig] = useState<FormatConfig>({
    variables: ["H1", "CTA"],
    mode: "default",
    slideCount: 3,
    slides: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch available formats (client-linked)
  useEffect(() => {
    async function load() {
      setLoadingFormats(true);
      try {
        const res = await fetch("/api/formats");
        if (!res.ok) throw new Error("Failed to fetch formats");
        const records = await res.json() as Array<{ id: string; fields: Record<string, unknown> }>;
        const parsed: AirtableFormat[] = records.map((r) => ({
          id: r.id,
          formatName: (r.fields["Format_Name"] as string) || "",
          widthPx: (r.fields["Width"] as number) || 0,
          heightPx: (r.fields["Height"] as number) || 0,
          channel: (r.fields["Channel"] as string) || "Web",
          device: (r.fields["Device"] as string) || "Desktop",
          figmaFrameBase: (r.fields["Figma_Frame_Base"] as string) || "",
          safeArea: (r.fields["Safe_Area"] as string) || "",
          outputFormat: (r.fields["Output_Format"] as string) || "PNG",
          active: (r.fields["Active"] as boolean) || false,
        }));
        // Filter to client-linked formats only (if clientFormatIds provided)
        const filtered =
          clientFormatIds.length > 0
            ? parsed.filter((f) => clientFormatIds.includes(f.id))
            : parsed;
        setFormats(filtered);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load formats");
      } finally {
        setLoadingFormats(false);
      }
    }
    void load();
  }, [clientFormatIds]);

  // When format selection changes, reset config
  const handleFormatChange = useCallback((ids: string[]) => {
    // Only allow one format at a time in this modal
    const newId = ids.find((id) => !selectedFormatIds.includes(id)) ?? ids[ids.length - 1];
    if (!newId) {
      setSelectedFormatIds([]);
      return;
    }
    setSelectedFormatIds([newId]);
    setFormatConfig({ variables: ["H1", "CTA"], mode: "default", slideCount: 3, slides: [] });
  }, [selectedFormatIds]);

  const toggleVariable = (v: string) => {
    setFormatConfig((prev) => {
      const has = prev.variables.includes(v);
      const vars = has ? prev.variables.filter((x) => x !== v) : [...prev.variables, v];
      // Keep slides in sync
      const slides = prev.slides.map((s) => ({
        ...s,
        variables: has ? s.variables.filter((x) => x !== v) : [...s.variables, v],
      }));
      return { ...prev, variables: vars, slides };
    });
  };

  const setMode = (mode: FormatMode) => {
    setFormatConfig((prev) => {
      let slides = prev.slides;
      if (mode === "carousel" && slides.length === 0) {
        slides = buildEmptySlides(prev.slideCount, prev.variables);
      }
      if (mode !== "carousel") slides = [];
      return { ...prev, mode, slides };
    });
  };

  const setSlideCount = (count: number) => {
    const newCount = Math.max(2, count);
    setFormatConfig((prev) => {
      let slides = [...prev.slides];
      if (newCount > slides.length) {
        for (let i = slides.length; i < newCount; i++) {
          slides.push({ index: i + 1, variables: [...prev.variables] });
        }
      } else {
        slides = slides.slice(0, newCount).map((s, i) => ({ ...s, index: i + 1 }));
      }
      return { ...prev, slideCount: newCount, slides };
    });
  };

  const toggleSlideVariable = (slideIdx: number, v: string) => {
    setFormatConfig((prev) => {
      const slides = prev.slides.map((s, i) => {
        if (i !== slideIdx) return s;
        const has = s.variables.includes(v);
        return {
          ...s,
          variables: has ? s.variables.filter((x) => x !== v) : [...s.variables, v],
        };
      });
      return { ...prev, slides };
    });
  };

  const selectedFormat = formats.find((f) => selectedFormatIds.includes(f.id));

  const handleSubmit = async () => {
    if (!selectedFormat) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const body = {
        formats: [
          {
            formatName: selectedFormat.formatName,
            variables: formatConfig.variables,
            mode: formatConfig.mode,
            slideCount: formatConfig.slideCount,
            slides:
              formatConfig.mode === "carousel"
                ? formatConfig.slides.map((s) => ({ index: s.index, variables: s.variables }))
                : [],
          },
        ],
        updateFieldConfig: true,
      };

      const res = await fetch(`/api/campaigns/${campaignId}/generate-banners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate banners");
        return;
      }

      // Fetch the newly created banners
      const bannersRes = await fetch(
        `/api/campaigns/${campaignId}/banners`
      );
      let newBanners: Banner[] = [];
      if (bannersRes.ok) {
        const bannersData = await bannersRes.json();
        newBanners = bannersData.banners ?? bannersData ?? [];
      }

      // Build updated fieldConfig for the parent
      const existingFormatNamesList: string[] = Array.isArray(fieldConfig.formats)
        ? fieldConfig.formats
        : Object.keys(fieldConfig.formats ?? {});
      const updatedFieldConfig: FieldConfig = {
        ...fieldConfig,
        formats: Array.from(new Set([...existingFormatNamesList, selectedFormat.formatName])),
        variables: Array.from(
          new Set([...fieldConfig.variables, ...formatConfig.variables])
        ),
        formatConfigs: {
          ...(fieldConfig.formatConfigs ?? {}),
          [selectedFormat.formatName]: {
            variables: formatConfig.variables,
            mode: formatConfig.mode,
            slideCount: formatConfig.slideCount,
            slides:
              formatConfig.mode === "carousel"
                ? formatConfig.slides.map((s) => ({ index: s.index, variables: s.variables }))
                : [],
          },
        },
      };

      // Count newly created non-Slide banners for the success message
      const newParentCount = newBanners.filter((b) => b.bannerType !== "Slide").length;
      const msg = `✓ Format added — ${newParentCount} banner${newParentCount !== 1 ? "s" : ""} created`;
      setSuccessMessage(msg);
      // Brief green flash, then hand off to parent
      setTimeout(() => {
        onSuccess(newBanners, updatedFieldConfig);
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 backdrop-blur-[1px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl sm:h-screen">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Add Format to Campaign</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Languages info */}
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">Languages:</span>{" "}
              {fieldConfig.languages.join(", ")}
              <span className="ml-2 text-gray-400">(inherited from campaign)</span>
            </p>
          </div>

          {/* Step 1 — Format picker */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
              1. Select Format
            </h3>
            {loadingFormats ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="animate-spin inline-block h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full" />
                Loading formats…
              </div>
            ) : (
              <FormatPicker
                formats={formats}
                selected={selectedFormatIds}
                onChange={handleFormatChange}
                showCount={false}
              />
            )}
          </section>

          {/* Step 2 — Variable toggles (only when a format is selected) */}
          {selectedFormat && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                2. Variables
              </h3>
              <div className="flex flex-wrap gap-2">
                {variableOptions.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => toggleVariable(v.value)}
                    className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${
                      formatConfig.variables.includes(v.value)
                        ? "border-purple-600 bg-purple-600 text-white"
                        : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Step 3 — Mode selector */}
          {selectedFormat && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                3. Mode
              </h3>
              <div className="flex gap-2">
                {(["default", "specific", "carousel"] as FormatMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      formatConfig.mode === m
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              {/* Carousel: slide count + per-slide variable toggles */}
              {formatConfig.mode === "carousel" && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500">Slides:</span>
                    <button
                      type="button"
                      onClick={() => setSlideCount(formatConfig.slideCount - 1)}
                      className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-xs text-gray-600 hover:bg-gray-100"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-medium text-gray-700">
                      {formatConfig.slideCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSlideCount(formatConfig.slideCount + 1)}
                      className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-xs text-gray-600 hover:bg-gray-100"
                    >
                      +
                    </button>
                  </div>

                  {formatConfig.slides.map((slide, idx) => (
                    <div
                      key={idx}
                      className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 space-y-2"
                    >
                      <p className="text-xs font-semibold text-gray-500">
                        Slide {slide.index}
                        {slide.variables.length === 0 && (
                          <span className="ml-2 font-normal text-gray-400 italic">(image only)</span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {variableOptions.map((v) => (
                          <button
                            key={v.value}
                            type="button"
                            onClick={() => toggleSlideVariable(idx, v.value)}
                            className={`rounded border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                              slide.variables.includes(v.value)
                                ? "border-purple-600 bg-purple-600 text-white"
                                : "border-gray-200 bg-white text-gray-400 hover:bg-gray-50"
                            }`}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Success flash */}
          {successMessage && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {successMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedFormat || isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin inline-block h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                Adding format…
              </>
            ) : successMessage ? (
              successMessage
            ) : (
              "Add to campaign"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

