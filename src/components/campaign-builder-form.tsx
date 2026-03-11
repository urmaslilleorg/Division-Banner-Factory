"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AirtableFormat } from "@/lib/airtable-campaigns";
import { VariableDefinition } from "@/components/variables-manager";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import type { ClientVariable } from "@/lib/types";

const FALLBACK_VARIABLE_OPTIONS = [
  { value: "H1", label: "H1" },
  { value: "H2", label: "H2" },
  { value: "H3", label: "H3" },
  { value: "CTA", label: "CTA" },
  { value: "Price_Tag", label: "Price Tag" },
  { value: "Illustration", label: "Illustration" },
];

const LANGUAGE_OPTIONS = [
  { value: "ET", label: "ET" },
  { value: "EN", label: "EN" },
];

// Copy mode for each format
type FormatMode = "default" | "specific" | "carousel";

// Per-slide copy: Record<varId, value>
type SlideCopy = Record<string, string>;

// Per-format config
interface FormatConfig {
  variables: string[];
  mode: FormatMode;
  copy: Record<string, string>;
  slideCount: number;
  slides: SlideCopy[];
}

interface CreateResponse {
  campaignId: string;
  bannerCount: number;
  figmaFrames: string[];
  year: number | null;
  month: number | null;
}

// ── initialData shape (for edit mode) ─────────────────────────────────────────
export interface CampaignInitialData {
  campaignName: string;
  productName: string;
  launchMonth: string;
  startDate?: string;
  endDate?: string;
  // Parsed Field_Config object from Airtable
  fieldConfig?: {
    languages?: string[];
    formats?: string[];
    variables?: string[];
    // Per-format configs keyed by format NAME (not ID)
    formatConfigs?: Record<string, {
      variables?: string[];
      mode?: FormatMode;
      copy?: Record<string, string>;
      slideCount?: number;
      slides?: SlideCopy[];
    }>;
    defaultCopy?: Record<string, string>;
  };
}

interface CampaignBuilderFormProps {
  formats: AirtableFormat[];
  variableRegistry?: VariableDefinition[];
  /** Client name from subdomain context — auto-set, not user-selectable */
  clientName: string;
  /** Per-client variable labels. When provided, overrides global registry labels. */
  clientVariables?: ClientVariable[];
  /** "create" (default) or "edit" */
  mode?: "create" | "edit";
  /** Airtable record ID — required when mode === "edit" */
  campaignId?: string;
  /** Pre-fill values — used when mode === "edit" */
  initialData?: CampaignInitialData;
}

// ── Helper: build FormatConfig map from initialData.fieldConfig ───────────────
function buildInitialFormatConfigs(
  formats: AirtableFormat[],
  fieldConfig: CampaignInitialData["fieldConfig"]
): Record<string, FormatConfig> {
  if (!fieldConfig?.formatConfigs) return {};
  const result: Record<string, FormatConfig> = {};
  for (const f of formats) {
    const saved = fieldConfig.formatConfigs[f.formatName];
    if (saved) {
      result[f.id] = {
        variables: saved.variables ?? ["H1", "CTA"],
        mode: saved.mode ?? "default",
        copy: saved.copy ?? {},
        slideCount: saved.slideCount ?? 3,
        slides: saved.slides ?? [],
      };
    }
  }
  return result;
}

export default function CampaignBuilderForm({
  formats,
  variableRegistry,
  clientName,
  clientVariables,
  mode = "create",
  campaignId,
  initialData,
}: CampaignBuilderFormProps) {
  // Build variable options: start from global registry or fallback, then override labels
  const baseOptions = variableRegistry && variableRegistry.length > 0
    ? variableRegistry.map((v) => ({ value: v.id, label: v.label }))
    : FALLBACK_VARIABLE_OPTIONS;

  const variableOptions = clientVariables && clientVariables.length > 0
    ? baseOptions
        .filter((opt) => clientVariables.some((cv) => cv.slot === opt.value))
        .map((opt) => {
          const cv = clientVariables.find((cv) => cv.slot === opt.value);
          return { value: opt.value, label: cv ? cv.label : opt.label };
        })
    : baseOptions;

  const router = useRouter();

  // ── Form state — initialised from initialData in edit mode ──────────────────
  const [campaignName, setCampaignName] = useState(initialData?.campaignName ?? "");
  const [productName, setProductName] = useState(initialData?.productName ?? "");
  const [launchMonth, setLaunchMonth] = useState(initialData?.launchMonth ?? "");
  const [startDate, setStartDate] = useState(initialData?.startDate ?? "");
  const [endDate, setEndDate] = useState(initialData?.endDate ?? "");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    initialData?.fieldConfig?.languages ?? ["ET"]
  );

  // Pre-select formats from fieldConfig.formats (array of format names → match by name)
  const initialFormatIds = (() => {
    const names = new Set(initialData?.fieldConfig?.formats ?? []);
    return formats.filter((f) => names.has(f.formatName)).map((f) => f.id);
  })();
  const [selectedFormats, setSelectedFormats] = useState<string[]>(initialFormatIds);

  // Per-format config map: formatId → FormatConfig
  const [formatConfigs, setFormatConfigs] = useState<Record<string, FormatConfig>>(
    buildInitialFormatConfigs(formats, initialData?.fieldConfig)
  );

  // Which format panels are expanded — pre-expand selected formats in edit mode
  const [expandedFormats, setExpandedFormats] = useState<Record<string, boolean>>(
    mode === "edit"
      ? Object.fromEntries(initialFormatIds.map((id) => [id, false]))
      : {}
  );

  // Which channel groups are expanded — pre-expand channels with selected formats in edit mode
  const preExpandedChannels = mode === "edit"
    ? new Set(formats.filter((f) => initialFormatIds.includes(f.id)).map((f) => f.channel || "Other"))
    : new Set<string>();
  const [expandedChannels, setExpandedChannels] = useState<Record<string, boolean>>(
    Object.fromEntries(Array.from(preExpandedChannels).map((ch) => [ch, true]))
  );
  const toggleChannelExpanded = (ch: string) =>
    setExpandedChannels((prev) => ({ ...prev, [ch]: !prev[ch] }));

  // Campaign-level default copy
  const [defaultCopy, setDefaultCopy] = useState<Record<string, string>>(
    initialData?.fieldConfig?.defaultCopy ?? {}
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Group formats by channel
  const formatsByChannel = formats.reduce<Record<string, AirtableFormat[]>>(
    (acc, f) => {
      const ch = f.channel || "Other";
      if (!acc[ch]) acc[ch] = [];
      acc[ch].push(f);
      return acc;
    },
    {}
  );

  // Get or initialise per-format config
  const getFormatConfig = (formatId: string): FormatConfig => {
    return formatConfigs[formatId] ?? {
      variables: ["H1", "CTA"],
      mode: "default",
      copy: {},
      slideCount: 3,
      slides: [],
    };
  };

  // Build an empty slides array of length n for a given variable set
  const buildEmptySlides = (n: number, variables: string[]): SlideCopy[] =>
    Array.from({ length: n }, () =>
      Object.fromEntries(variables.map((v) => [v, ""]))
    );

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const toggleFormat = (id: string) => {
    setSelectedFormats((prev) => {
      if (prev.includes(id)) {
        return prev.filter((f) => f !== id);
      } else {
        if (!formatConfigs[id]) {
          setFormatConfigs((c) => ({
            ...c,
            [id]: { variables: ["H1", "CTA"], mode: "default", copy: {}, slideCount: 3, slides: [] },
          }));
        }
        setExpandedFormats((e) => ({ ...e, [id]: true }));
        return [...prev, id];
      }
    });
  };

  const toggleFormatExpanded = (id: string) => {
    setExpandedFormats((e) => ({ ...e, [id]: !e[id] }));
  };

  const toggleFormatVariable = (formatId: string, variable: string) => {
    setFormatConfigs((prev) => {
      const cfg = getFormatConfig(formatId);
      const adding = !cfg.variables.includes(variable);
      const vars = adding
        ? [...cfg.variables, variable]
        : cfg.variables.filter((v) => v !== variable);

      const copy = { ...cfg.copy };
      if (adding) copy[variable] = copy[variable] ?? "";
      else delete copy[variable];

      const slides = cfg.slides.map((s) => {
        const next = { ...s };
        if (adding) next[variable] = next[variable] ?? "";
        else delete next[variable];
        return next;
      });

      return { ...prev, [formatId]: { ...cfg, variables: vars, copy, slides } };
    });
  };

  const setFormatMode = (formatId: string, mode: FormatMode) => {
    setFormatConfigs((prev) => {
      const cfg = getFormatConfig(formatId);
      let slides = cfg.slides;
      if (mode === "carousel" && slides.length === 0) {
        slides = buildEmptySlides(cfg.slideCount, cfg.variables);
      }
      if (mode !== "carousel") slides = [];
      return { ...prev, [formatId]: { ...cfg, mode, slides } };
    });
  };

  const setFormatSlideCount = (formatId: string, count: number) => {
    const newCount = Math.max(2, count);
    setFormatConfigs((prev) => {
      const cfg = getFormatConfig(formatId);
      let slides = [...cfg.slides];
      if (newCount > slides.length) {
        const toAdd = newCount - slides.length;
        for (let i = 0; i < toAdd; i++) {
          slides.push(Object.fromEntries(cfg.variables.map((v) => [v, ""])));
        }
      } else {
        slides = slides.slice(0, newCount);
      }
      return { ...prev, [formatId]: { ...cfg, slideCount: newCount, slides } };
    });
  };

  const setSpecificCopyField = (formatId: string, varId: string, value: string) => {
    setFormatConfigs((prev) => {
      const cfg = getFormatConfig(formatId);
      return { ...prev, [formatId]: { ...cfg, copy: { ...cfg.copy, [varId]: value } } };
    });
  };

  const setSlideCopyField = (formatId: string, slideIndex: number, varId: string, value: string) => {
    setFormatConfigs((prev) => {
      const cfg = getFormatConfig(formatId);
      const slides = cfg.slides.map((s, i) =>
        i === slideIndex ? { ...s, [varId]: value } : s
      );
      return { ...prev, [formatId]: { ...cfg, slides } };
    });
  };

  // Union of all active variables across selected formats (for Default Copy section)
  const allActiveVariables = Array.from(
    new Set(selectedFormats.flatMap((id) => getFormatConfig(id).variables))
  );

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignName.trim()) { setError("Campaign name is required."); return; }
    if (!productName.trim()) { setError("Product name is required."); return; }
    if (!launchMonth) { setError("Launch month is required."); return; }
    if (selectedLanguages.length === 0) { setError("Select at least one language."); return; }
    if (selectedFormats.length === 0) { setError("Select at least one format."); return; }

    setIsSubmitting(true);
    setError(null);

    const selectedFormatData = formats.filter((f) => selectedFormats.includes(f.id));

    if (mode === "edit") {
      // ── EDIT: PATCH /api/campaigns/[id] ─────────────────────────────────────
      if (!campaignId) {
        setError("Campaign ID is missing — cannot save.");
        setIsSubmitting(false);
        return;
      }

      // Build updated Field_Config
      const fieldConfigFormats: Record<string, { variables: string[]; mode: FormatMode; slideCount?: number }> = {};
      for (const f of selectedFormatData) {
        const cfg = getFormatConfig(f.id);
        fieldConfigFormats[f.formatName] = {
          variables: cfg.variables,
          mode: cfg.mode,
          ...(cfg.mode === "carousel" ? { slideCount: cfg.slideCount } : {}),
        };
      }

      // Build per-format configs for Field_Config storage
      const savedFormatConfigs: Record<string, object> = {};
      for (const f of selectedFormatData) {
        const cfg = getFormatConfig(f.id);
        savedFormatConfigs[f.formatName] = {
          variables: cfg.variables,
          mode: cfg.mode,
          copy: cfg.copy,
          slideCount: cfg.slideCount,
          slides: cfg.slides,
        };
      }

      const updatedFieldConfig = {
        ...(initialData?.fieldConfig ?? {}),
        languages: selectedLanguages,
        formats: selectedFormatData.map((f) => f.formatName),
        variables: variableOptions.map((v) => v.value),
        formatConfigs: savedFormatConfigs,
        defaultCopy,
      };

      try {
        const res = await fetch(`/api/campaigns/${campaignId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            "Campaign Name": campaignName.trim(),
            Product_Name: productName.trim(),
            Launch_Month: launchMonth,
            Field_Config: JSON.stringify(updatedFieldConfig),
          }),
        });

        const data = await res.json() as { error?: string; bannersCreated?: number };
        if (!res.ok) {
          throw new Error(data.error || "Failed to update campaign");
        }

        const bannersCreated = data.bannersCreated ?? 0;
        const flashMsg = bannersCreated > 0
          ? `Campaign updated — ${bannersCreated} new banner record${bannersCreated !== 1 ? "s" : ""} created`
          : "Campaign updated successfully";
        setFlash(flashMsg);

        const destination = `/campaigns/${campaignId}?preview=true`;
        setTimeout(() => router.push(destination), 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsSubmitting(false);
      }

    } else {
      // ── CREATE: POST /api/campaigns/create ──────────────────────────────────
      const fieldConfigFormats: Record<string, { variables: string[]; mode: FormatMode; slideCount?: number }> = {};
      for (const f of selectedFormatData) {
        const cfg = getFormatConfig(f.id);
        fieldConfigFormats[f.formatName] = {
          variables: cfg.variables,
          mode: cfg.mode,
          ...(cfg.mode === "carousel" ? { slideCount: cfg.slideCount } : {}),
        };
      }

      try {
        const res = await fetch("/api/campaigns/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignName: campaignName.trim(),
            productName: productName.trim(),
            clientName,
            launchMonth,
            startDate,
            endDate,
            languages: selectedLanguages,
            defaultCopy: Object.fromEntries(
              Object.entries(defaultCopy).map(([k, v]) => [k, v.trim() || null])
            ),
            formats: selectedFormatData.map((f) => {
              const cfg = getFormatConfig(f.id);
              const base = {
                id: f.id,
                formatName: f.formatName,
                widthPx: f.widthPx,
                heightPx: f.heightPx,
                channel: f.channel,
                device: f.device,
                safeArea: f.safeArea,
                outputFormat: f.outputFormat,
                figmaFrameBase: f.figmaFrameBase,
                variables: cfg.variables,
                mode: cfg.mode,
              };
              if (cfg.mode === "specific") {
                return { ...base, copy: cfg.copy };
              }
              if (cfg.mode === "carousel") {
                return { ...base, slideCount: cfg.slideCount, slides: cfg.slides };
              }
              return base;
            }),
            fieldConfigFormats,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create campaign");
        }

        const data = (await res.json()) as CreateResponse;

        const bannerCount = data.bannerCount;
        setFlash(`Campaign created — ${bannerCount} banner record${bannerCount !== 1 ? "s" : ""} generated`);

        const destination =
          data.year && data.month
            ? `/${data.year}/${data.month}?preview=true`
            : "/campaigns?preview=true";

        setTimeout(() => router.push(destination), 1200);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Campaign Name */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">
          Campaign Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          placeholder="e.g. Avene Spring 2026"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {/* Product Name */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">
          Product name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="e.g. HydraBoost, SunCream"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <p className="text-xs text-gray-400">Used in banner file naming. No spaces — use CamelCase.</p>
      </div>

      {/* Launch Month */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">
          Launch Month <span className="text-red-500">*</span>
        </label>
        <input
          type="month"
          value={launchMonth ? convertToInputMonth(launchMonth) : ""}
          onChange={(e) => setLaunchMonth(convertFromInputMonth(e.target.value))}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        {launchMonth && (
          <p className="text-xs text-gray-400">Stored as: &quot;{launchMonth}&quot;</p>
        )}
      </div>

      {/* Start / End Date */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      {/* Languages */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Languages <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2">
          {LANGUAGE_OPTIONS.map((lang) => (
            <button
              key={lang.value}
              type="button"
              onClick={() => toggleLanguage(lang.value)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                selectedLanguages.includes(lang.value)
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* Formats */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Formats <span className="text-red-500">*</span>
          </label>
          <span className="text-xs text-gray-400">{selectedFormats.length} selected</span>
        </div>

        {mode === "edit" && (
          <p className="text-xs text-gray-400">
            Note: changing formats here updates the campaign record only. Existing banner records are not affected.
          </p>
        )}

        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
          {Object.entries(formatsByChannel).map(([channel, channelFormats]) => {
            const isChOpen = !!expandedChannels[channel];
            const selectedInCh = channelFormats.filter((f) => selectedFormats.includes(f.id)).length;
            return (
            <div key={channel}>
              {/* Channel header — collapsible */}
              <button
                type="button"
                onClick={() => toggleChannelExpanded(channel)}
                className="flex w-full items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-150 ${isChOpen ? "rotate-90" : ""}`}
                />
                <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {channel}
                </span>
                {selectedInCh > 0 && (
                  <span className="text-xs text-gray-400">{selectedInCh} selected</span>
                )}
              </button>
              {/* Format rows — shown when channel is expanded */}
              {isChOpen && (
              <div className="px-3 py-2 space-y-2">
                {channelFormats.map((f) => {
                  const isChecked = selectedFormats.includes(f.id);
                  const cfg = getFormatConfig(f.id);
                  const isExpanded = expandedFormats[f.id] ?? false;

                  return (
                    <div
                      key={f.id}
                      className={`rounded-md border ${isChecked ? "border-gray-300 bg-gray-50" : "border-transparent"}`}
                    >
                      {/* Format row header */}
                      <div className="flex cursor-pointer items-center gap-2.5 px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleFormat(f.id)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
                        />
                        <span
                          className="flex-1 text-sm text-gray-700"
                          onClick={() => isChecked && toggleFormatExpanded(f.id)}
                        >
                          {f.formatName}
                        </span>
                        <span className="text-xs text-gray-400">
                          {f.widthPx}×{f.heightPx}
                        </span>
                        {isChecked && (
                          <>
                            {/* Mode badge */}
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              cfg.mode === "carousel"
                                ? "bg-purple-100 text-purple-700"
                                : cfg.mode === "specific"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-gray-100 text-gray-500"
                            }`}>
                              {cfg.mode}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleFormatExpanded(f.id)}
                              className="ml-1 text-gray-400 hover:text-gray-600"
                            >
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRight className="h-3.5 w-3.5" />
                              }
                            </button>
                          </>
                        )}
                      </div>

                      {/* Per-format config panel */}
                      {isChecked && isExpanded && (
                        <div className="border-t border-gray-200 px-3 pb-3 pt-2 space-y-3">

                          {/* Variables */}
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium text-gray-500">Variables</p>
                            <div className="flex flex-wrap gap-1.5">
                              {variableOptions.map((v) => (
                                <button
                                  key={v.value}
                                  type="button"
                                  onClick={() => toggleFormatVariable(f.id, v.value)}
                                  className={`rounded border px-2 py-0.5 text-xs font-medium transition-colors ${
                                    cfg.variables.includes(v.value)
                                      ? "border-gray-800 bg-gray-800 text-white"
                                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                                  }`}
                                >
                                  {v.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Three-way mode selector */}
                          <div className="space-y-1.5">
                            <div className="flex gap-1">
                              {(["default", "specific", "carousel"] as FormatMode[]).map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => setFormatMode(f.id, m)}
                                  className={`rounded-md border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                                    cfg.mode === m
                                      ? m === "carousel"
                                        ? "border-purple-600 bg-purple-600 text-white"
                                        : m === "specific"
                                        ? "border-blue-600 bg-blue-600 text-white"
                                        : "border-gray-800 bg-gray-800 text-white"
                                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                                  }`}
                                >
                                  {m}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* DEFAULT mode */}
                          {cfg.mode === "default" && (
                            <p className="text-xs text-gray-400 italic">
                              Uses campaign-level Default Copy values below.
                            </p>
                          )}

                          {/* SPECIFIC mode */}
                          {cfg.mode === "specific" && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-gray-500">Format-specific copy</p>
                              {cfg.variables.map((varId) => {
                                const varLabel =
                                  variableOptions.find((v) => v.value === varId)?.label ?? varId;
                                return (
                                  <div key={varId} className="flex items-center gap-2">
                                    <label className="w-10 shrink-0 text-xs font-medium text-gray-500">
                                      {varLabel}
                                    </label>
                                    <input
                                      type="text"
                                      value={cfg.copy[varId] ?? ""}
                                      onChange={(e) =>
                                        setSpecificCopyField(f.id, varId, e.target.value)
                                      }
                                      placeholder={`${varLabel} for ${f.formatName}`}
                                      className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* CAROUSEL mode */}
                          {cfg.mode === "carousel" && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-500">Slides:</span>
                                <button
                                  type="button"
                                  onClick={() => setFormatSlideCount(f.id, cfg.slideCount - 1)}
                                  className="flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-xs text-gray-600 hover:bg-gray-100"
                                >
                                  −
                                </button>
                                <span className="w-6 text-center text-sm font-medium text-gray-700">
                                  {cfg.slideCount}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setFormatSlideCount(f.id, cfg.slideCount + 1)}
                                  className="flex h-5 w-5 items-center justify-center rounded border border-gray-200 text-xs text-gray-600 hover:bg-gray-100"
                                >
                                  +
                                </button>
                              </div>

                              {cfg.slides.map((slide, slideIdx) => (
                                <div
                                  key={slideIdx}
                                  className="rounded-md border border-gray-200 bg-white px-3 py-2 space-y-2"
                                >
                                  <p className="text-xs font-semibold text-gray-500">
                                    Slide {slideIdx + 1}
                                  </p>
                                  {cfg.variables.map((varId) => {
                                    const varLabel =
                                      variableOptions.find((v) => v.value === varId)?.label ?? varId;
                                    return (
                                      <div key={varId} className="flex items-center gap-2">
                                        <label className="w-10 shrink-0 text-xs font-medium text-gray-500">
                                          {varLabel}
                                        </label>
                                        <input
                                          type="text"
                                          value={slide[varId] ?? ""}
                                          onChange={(e) =>
                                            setSlideCopyField(f.id, slideIdx, varId, e.target.value)
                                          }
                                          placeholder={`${varLabel} for slide ${slideIdx + 1}`}
                                          className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              )}
            </div>
            );
          })}
        </div>
      </div>

      {/* Default Copy */}
      {allActiveVariables.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Default Copy (optional)</label>
            <p className="text-xs text-gray-400">
              Used by formats in Default mode. Edit per-banner in Copy Editor after creation.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {allActiveVariables.map((varId) => {
              const varLabel = variableOptions.find((v) => v.value === varId)?.label ?? varId;
              return (
                <div key={varId} className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">{varLabel}</label>
                  <input
                    type="text"
                    value={defaultCopy[varId] ?? ""}
                    onChange={(e) =>
                      setDefaultCopy((prev) => ({ ...prev, [varId]: e.target.value }))
                    }
                    placeholder={`Default ${varLabel}`}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Flash confirmation */}
      {flash && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          ✓ {flash}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <><Loader2 className="mr-1 h-4 w-4 animate-spin" />
              {mode === "edit" ? "Saving…" : "Creating…"}
            </>
          ) : (
            mode === "edit" ? "Save changes" : "Create campaign"
          )}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// Convert "April 2026" → "2026-04" for <input type="month">
function convertToInputMonth(label: string): string {
  const months: Record<string, string> = {
    January: "01", February: "02", March: "03", April: "04",
    May: "05", June: "06", July: "07", August: "08",
    September: "09", October: "10", November: "11", December: "12",
  };
  const [month, year] = label.split(" ");
  return `${year}-${months[month] || "01"}`;
}

// Convert "2026-04" → "April 2026"
function convertFromInputMonth(value: string): string {
  if (!value) return "";
  const months: Record<string, string> = {
    "01": "January", "02": "February", "03": "March", "04": "April",
    "05": "May", "06": "June", "07": "July", "08": "August",
    "09": "September", "10": "October", "11": "November", "12": "December",
  };
  const [year, month] = value.split("-");
  return `${months[month] || ""} ${year}`;
}
