"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AirtableFormat } from "@/lib/airtable-campaigns";
import { VariableDefinition } from "@/components/variables-manager";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown, ChevronRight, BookmarkPlus } from "lucide-react";
import type { ClientVariable } from "@/lib/types";
import ImportSection, { type ImportSectionState } from "@/components/import-section";
import type { CampaignTemplate } from "@/app/api/clients/[clientId]/templates/route";

const FALLBACK_VARIABLE_OPTIONS = [
  { value: "H1", label: "H1" },
  { value: "H2", label: "H2" },
  { value: "H3", label: "H3" },
  { value: "CTA", label: "CTA" },
  { value: "Price_Tag", label: "Price Tag" },
  { value: "Illustration", label: "Illustration" },
  { value: "Image", label: "Image" },
];

const LANGUAGE_OPTIONS = [
  { value: "ET", label: "ET" },
  { value: "EN", label: "EN" },
];

// Copy mode for each format
type FormatMode = "default" | "specific" | "carousel";

// Per-slide copy: Record<varId, value>
type SlideCopy = Record<string, string>;

// ── New per-slide config (Task 6 schema) ──────────────────────────────────────
// Each slide has its own variables array + copy object.
// If variables is empty → image-only slide.
interface SlideConfig {
  index: number;        // 1-based
  variables: string[];  // which variables are active for this slide
  copy: SlideCopy;      // copy values for active variables
}

// Per-format config
interface FormatConfig {
  variables: string[];   // format-level variable union / default
  mode: FormatMode;
  copy: Record<string, string>;   // used by "specific" mode
  slideCount: number;
  slides: SlideConfig[]; // NEW: per-slide configs
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
  /** JSON string of saved Column_Mapping from Airtable */
  columnMapping?: string | null;
  /** ISO timestamp of last import */
  lastImport?: string | null;
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
      // New schema: slides with per-slide variables
      slides?: Array<SlideConfig | SlideCopy>;
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
  /** Client subdomain — used for template API calls */
  clientId?: string;
  /** Saved templates for this client */
  templates?: CampaignTemplate[];
}

// ── Helper: normalise a saved slide to SlideConfig ───────────────────────────
function normaliseSlide(raw: SlideConfig | SlideCopy, index: number, formatVars: string[]): SlideConfig {
  // New schema: has "index" and "variables" keys
  if ("index" in raw && "variables" in raw) {
    return raw as SlideConfig;
  }
  // Old schema: plain SlideCopy — inherit format-level variables
  const copy = raw as SlideCopy;
  return {
    index: index + 1,
    variables: formatVars,
    copy,
  };
}

// ── Helper: build FormatConfig map from initialData.fieldConfig ───────────────
function buildInitialFormatConfigs(
  formats: AirtableFormat[],
  fieldConfig: CampaignInitialData["fieldConfig"]
): Record<string, FormatConfig> {
  // Support both new schema (formatConfigs key) and old schema (formats as object)
  const configSource: Record<string, { variables?: string[]; mode?: string; slideCount?: number; copy?: Record<string, string>; slides?: unknown[] }> | undefined =
    fieldConfig?.formatConfigs ??
    (fieldConfig?.formats && !Array.isArray(fieldConfig.formats)
      ? (fieldConfig.formats as Record<string, { variables?: string[]; mode?: string; slideCount?: number; copy?: Record<string, string>; slides?: unknown[] }>)
      : undefined);
  const defaultCopy = fieldConfig?.defaultCopy ?? {};
  const prefillVars = fieldConfig?.variables ?? [];

  // When we have prefill variables but no per-format config, seed all formats with prefill
  if (!configSource && prefillVars.length > 0) {
    const result: Record<string, FormatConfig> = {};
    for (const f of formats) {
      result[f.id] = {
        variables: prefillVars,
        mode: "default",
        copy: { ...defaultCopy },
        slideCount: 3,
        slides: [],
      };
    }
    return result;
  }

  if (!configSource) return {};
  const result: Record<string, FormatConfig> = {};
  for (const f of formats) {
    const saved = configSource[f.formatName];
    if (saved) {
      const vars = saved.variables ?? ["H1", "CTA"];
      const rawSlides = (saved.slides ?? []) as Parameters<typeof normaliseSlide>[0][];
      const slides: SlideConfig[] = rawSlides.map((s, i) => normaliseSlide(s, i, vars));
      result[f.id] = {
        variables: vars,
        mode: (saved.mode as FormatConfig["mode"]) ?? "default",
        // Merge defaultCopy with saved copy (saved takes priority)
        copy: { ...defaultCopy, ...(saved.copy ?? {}) },
        slideCount: saved.slideCount ?? (slides.length || 3),
        slides,
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
  clientId,
  templates = [],
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

  // Pre-select formats from fieldConfig.formats.
  // Supports both new schema (string[]) and old schema (object keyed by formatName).
  const initialFormatIds = (() => {
    const raw = initialData?.fieldConfig?.formats ?? [];
    const namesArray: string[] = Array.isArray(raw) ? raw : Object.keys(raw);
    const names = new Set(namesArray);
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // ── Template state ──────────────────────────────────────────────────────────
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showTemplateSaveUI, setShowTemplateSaveUI] = useState(false);

  const handleSaveAsTemplate = async () => {
    if (!clientId || !templateName.trim()) return;
    setTemplateSaving(true);
    try {
      // Build the current fieldConfig snapshot
      const selectedFormatData = formats.filter((f) => selectedFormats.includes(f.id));
      const savedFormatConfigs: Record<string, object> = {};
      for (const f of selectedFormatData) {
        const cfg = getFormatConfig(f.id);
        savedFormatConfigs[f.formatName] = {
          variables: cfg.variables,
          mode: cfg.mode,
          copy: cfg.copy,
          slideCount: cfg.slideCount,
          slides: cfg.mode === "carousel"
            ? cfg.slides.map((s) => ({ index: s.index, variables: s.variables, copy: s.copy }))
            : [],
        };
      }
      const fieldConfig = {
        languages: selectedLanguages,
        formats: selectedFormatData.map((f) => f.formatName),
        variables: variableOptions.map((v) => v.value),
        formatConfigs: savedFormatConfigs,
      };
      const res = await fetch(`/api/clients/${clientId}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          fieldConfig,
          columnMapping: importState.columnMapping && Object.keys(importState.columnMapping).length > 0
            ? importState.columnMapping
            : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save template");
      setFlash(`Template "${templateName.trim()}" saved`);
      setTemplateName("");
      setShowTemplateSaveUI(false);
    } catch {
      setError("Failed to save template. Please try again.");
    } finally {
      setTemplateSaving(false);
    }
  };

  const applyTemplate = (tpl: CampaignTemplate) => {
    // Apply languages
    setSelectedLanguages(tpl.fieldConfig.languages ?? ["ET"]);
    // Apply formats — fieldConfig.formats can be string[] or Record<string, unknown>
    const formatsRaw = tpl.fieldConfig.formats ?? [];
    const formatsArray = Array.isArray(formatsRaw)
      ? (formatsRaw as string[])
      : Object.keys(formatsRaw as Record<string, unknown>);
    const tplFormatNames = new Set(formatsArray);
    const tplFormatIds = formats.filter((f) => tplFormatNames.has(f.formatName)).map((f) => f.id);
    setSelectedFormats(tplFormatIds);
    // Apply per-format configs
    const newConfigs: Record<string, FormatConfig> = {};
    for (const f of formats) {
      if (!tplFormatIds.includes(f.id)) continue;
      const saved = (tpl.fieldConfig.formatConfigs as Record<string, {
        variables?: string[];
        mode?: FormatMode;
        copy?: Record<string, string>;
        slideCount?: number;
        slides?: Array<SlideConfig | SlideCopy>;
      }>)?.[f.formatName];
      if (saved) {
        const vars = saved.variables ?? ["H1", "CTA"];
        const rawSlides = saved.slides ?? [];
        const slides: SlideConfig[] = rawSlides.map((s, i) => normaliseSlide(s, i, vars));
        newConfigs[f.id] = {
          variables: vars,
          mode: saved.mode ?? "default",
          copy: saved.copy ?? {},
          slideCount: saved.slideCount ?? (slides.length || 3),
          slides,
        };
      }
    }
    setFormatConfigs(newConfigs);
    // Expand channels that have selected formats
    const channels = new Set(formats.filter((f) => tplFormatIds.includes(f.id)).map((f) => f.channel || "Other"));
    setExpandedChannels(Object.fromEntries(Array.from(channels).map((ch) => [ch, true])));
    setFlash(`Template applied — review and save`);
  };

  // ── Import state ──────────────────────────────────────────────────────────
  const [importState, setImportState] = useState<ImportSectionState>({
    file: null,
    columnMapping: {},
    syncKeyColumn: null,
    preview: null,
    readyToImport: false,
  });
  const handleImportChange = useCallback((state: ImportSectionState) => {
    setImportState(state);
  }, []);

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

  // Build empty SlideConfig array of length n, inheriting format-level variables
  const buildEmptySlides = (n: number, variables: string[]): SlideConfig[] =>
    Array.from({ length: n }, (_, i) => ({
      index: i + 1,
      variables: [...variables],
      copy: Object.fromEntries(variables.map((v) => [v, ""])),
    }));

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
          // Seed with prefill variables/copy if available
          const prefillVars2 = initialData?.fieldConfig?.variables ?? [];
          const prefillCopy2 = initialData?.fieldConfig?.defaultCopy ?? {};
          const seedVars = prefillVars2.length > 0 ? prefillVars2 : ["H1", "CTA"];
          const seedCopy = prefillVars2.length > 0 ? { ...prefillCopy2 } : {};
          setFormatConfigs((c) => ({
            ...c,
            [id]: { variables: seedVars, mode: "default", copy: seedCopy, slideCount: 3, slides: [] },
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

  // Toggle a format-level variable (affects default set + all slides that inherit it)
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

      // Update slides: if adding, add to slides that don't have it; if removing, remove from all
      const slides = cfg.slides.map((s) => {
        const slideVars = adding
          ? s.variables.includes(variable) ? s.variables : [...s.variables, variable]
          : s.variables.filter((v) => v !== variable);
        const slideCopy = { ...s.copy };
        if (adding && !slideCopy[variable]) slideCopy[variable] = "";
        if (!adding) delete slideCopy[variable];
        return { ...s, variables: slideVars, copy: slideCopy };
      });

      return { ...prev, [formatId]: { ...cfg, variables: vars, copy, slides } };
    });
  };

  const setFormatMode = (formatId: string, newMode: FormatMode) => {
    setFormatConfigs((prev) => {
      const cfg = getFormatConfig(formatId);
      let slides = cfg.slides;
      if (newMode === "carousel" && slides.length === 0) {
        slides = buildEmptySlides(cfg.slideCount, cfg.variables);
      }
      if (newMode !== "carousel") slides = [];
      return { ...prev, [formatId]: { ...cfg, mode: newMode, slides } };
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
          slides.push({
            index: slides.length + 1,
            variables: [...cfg.variables],
            copy: Object.fromEntries(cfg.variables.map((v) => [v, ""])),
          });
        }
      } else {
        slides = slides.slice(0, newCount).map((s, i) => ({ ...s, index: i + 1 }));
      }
      return { ...prev, [formatId]: { ...cfg, slideCount: newCount, slides } };
    });
  };

  // Toggle a variable for a specific slide
  const toggleSlideVariable = (formatId: string, slideIdx: number, variable: string) => {
    setFormatConfigs((prev) => {
      const cfg = getFormatConfig(formatId);
      const slides = cfg.slides.map((s, i) => {
        if (i !== slideIdx) return s;
        const adding = !s.variables.includes(variable);
        const slideVars = adding
          ? [...s.variables, variable]
          : s.variables.filter((v) => v !== variable);
        const slideCopy = { ...s.copy };
        if (adding && !slideCopy[variable]) slideCopy[variable] = "";
        if (!adding) delete slideCopy[variable];
        return { ...s, variables: slideVars, copy: slideCopy };
      });
      return { ...prev, [formatId]: { ...cfg, slides } };
    });
  };

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

      // Build per-format configs for Field_Config storage (new schema).
      // Copy content is intentionally excluded — it lives in the Copy & Assets tab.
      const savedFormatConfigs: Record<string, object> = {};
      for (const f of selectedFormatData) {
        const cfg = getFormatConfig(f.id);
        savedFormatConfigs[f.formatName] = {
          variables: cfg.variables,
          mode: cfg.mode,
          slideCount: cfg.slideCount,
          // Carousel: store per-slide variable structure only (no copy values)
          slides: cfg.mode === "carousel"
            ? cfg.slides.map((s) => ({
                index: s.index,
                variables: s.variables,
              }))
            : [],
        };
      }

      const updatedFieldConfig = {
        ...(initialData?.fieldConfig ?? {}),
        languages: selectedLanguages,
        formats: selectedFormatData.map((f) => f.formatName),
        variables: variableOptions.map((v) => v.value),
        formatConfigs: savedFormatConfigs,
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
        let importSummary = "";

        // Run import if ready
        if (importState.readyToImport && importState.file && importState.syncKeyColumn) {
          try {
            const fd = new FormData();
            fd.append("file", importState.file);
            fd.append("columnMapping", JSON.stringify(importState.columnMapping));
            fd.append("syncKey", importState.syncKeyColumn);
            const importRes = await fetch(`/api/campaigns/${campaignId}/import/execute`, {
              method: "POST",
              body: fd,
            });
            if (importRes.ok) {
              const importData = await importRes.json() as { created?: number; updated?: number; archived?: number };
              importSummary = ` · Import: ${importData.updated ?? 0} updated, ${importData.created ?? 0} created`;
            }
          } catch {
            // non-fatal: import failed but campaign was saved
          }
        }

        const flashMsg = bannersCreated > 0
          ? `Campaign updated — ${bannersCreated} new banner record${bannersCreated !== 1 ? "s" : ""} created${importSummary}`
          : `Campaign updated successfully${importSummary}`;
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
            // Copy fields intentionally omitted — entered later in Copy & Assets tab
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
              if (cfg.mode === "carousel") {
                // Pass per-slide variable structure only (no copy values)
                return {
                  ...base,
                  slideCount: cfg.slideCount,
                  slides: cfg.slides.map((s) => ({
                    index: s.index,
                    variables: s.variables,
                  })),
                };
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
        let importSummary = "";

        // Run import if ready (requires a campaign ID from the create response)
        if (importState.readyToImport && importState.file && importState.syncKeyColumn && data.campaignId) {
          try {
            const fd = new FormData();
            fd.append("file", importState.file);
            fd.append("columnMapping", JSON.stringify(importState.columnMapping));
            fd.append("syncKey", importState.syncKeyColumn);
            const importRes = await fetch(`/api/campaigns/${data.campaignId}/import/execute`, {
              method: "POST",
              body: fd,
            });
            if (importRes.ok) {
              const importData = await importRes.json() as { created?: number; updated?: number; archived?: number };
              importSummary = ` · Import: ${importData.updated ?? 0} updated, ${importData.created ?? 0} created`;
            }
          } catch {
            // non-fatal
          }
        }

        setFlash(`Campaign created — ${bannerCount} banner record${bannerCount !== 1 ? "s" : ""} generated${importSummary}`);

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

                          {/* Format-level Variables */}
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
                              Copy is entered per-banner in the Copy &amp; Assets tab after creation.
                            </p>
                          )}

                          {/* SPECIFIC mode — copy entered in Copy & Assets tab */}
                          {cfg.mode === "specific" && (
                            <p className="text-xs text-gray-400 italic">
                              Format-specific copy is entered in the Copy &amp; Assets tab after creation.
                            </p>
                          )}

                          {/* CAROUSEL mode — per-slide variable selection */}
                          {cfg.mode === "carousel" && (
                            <div className="space-y-3">
                              {/* Slide count control */}
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

                              {/* Per-slide config */}
                              {cfg.slides.map((slide, slideIdx) => (
                                <div
                                  key={slideIdx}
                                  className="rounded-md border border-gray-200 bg-white px-3 py-2 space-y-2"
                                >
                                  <p className="text-xs font-semibold text-gray-500">
                                    Slide {slide.index}
                                    {slide.variables.length === 0 && (
                                      <span className="ml-2 font-normal text-gray-400 italic">(image only)</span>
                                    )}
                                  </p>

                                  {/* Per-slide variable toggles */}
                                  <div className="flex flex-wrap gap-1">
                                    {variableOptions.map((v) => (
                                      <button
                                        key={v.value}
                                        type="button"
                                        onClick={() => toggleSlideVariable(f.id, slideIdx, v.value)}
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



      {/* Template selector — shown when templates exist */}
      {templates.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Apply a saved template</span>
            <select
              className="rounded border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900"
              defaultValue=""
              onChange={(e) => {
                const tpl = templates.find((t) => t.id === e.target.value);
                if (tpl) applyTemplate(tpl);
                e.target.value = "";
              }}
            >
              <option value="" disabled>Select template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.createdAt})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Import Section */}
      <ImportSection
        savedMapping={initialData?.columnMapping ?? null}
        lastImport={initialData?.lastImport ?? null}
        onChange={handleImportChange}
      />

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
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <><Loader2 className="mr-1 h-4 w-4 animate-spin" />
              {mode === "edit" ? "Saving…" : "Creating…"}
            </>
          ) : (
            mode === "edit" ? "Save changes" : "Create campaign"
          )}
        </Button>
        {mode === "edit" && campaignId ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/campaigns/${campaignId}?preview=true`)}
          >
            Back to Campaign
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        )}
        {/* Save as Template — only when clientId is available */}
        {clientId && (
          <div className="ml-auto flex items-center gap-2">
            {showTemplateSaveUI ? (
              <>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSaveAsTemplate(); } if (e.key === "Escape") setShowTemplateSaveUI(false); }}
                  placeholder="Template name…"
                  autoFocus
                  className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-44"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={templateSaving || !templateName.trim()}
                  onClick={() => void handleSaveAsTemplate()}
                >
                  {templateSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowTemplateSaveUI(false)}>Cancel</Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setShowTemplateSaveUI(true)}
              >
                <BookmarkPlus className="mr-1 h-4 w-4" />
                Save as Template
              </Button>
            )}
          </div>
        )}
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
