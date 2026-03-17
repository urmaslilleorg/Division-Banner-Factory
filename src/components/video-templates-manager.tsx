"use client";

import { useState, useCallback } from "react";
import AnimationPreviewPanel from "./animation-preview-panel";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AnimationEntry {
  variable: string;
  effect: AnimationEffect;
  start: number;
  end: number;
}

export interface ExitConfig {
  effect: AnimationEffect;
  duration: number;
}

export interface VideoTemplate {
  id: string;
  name: string;
  duration: number;
  createdAt: string;
  exit: ExitConfig;
  animations: AnimationEntry[];
}

export type AnimationEffect =
  | "fade_in"
  | "fade_out"
  | "slide_up"
  | "slide_down"
  | "slide_left"
  | "slide_right"
  | "zoom_in"
  | "zoom_out"
  | "pop"
  | "pulse"
  | "none";

// ── Constants ─────────────────────────────────────────────────────────────────

const EFFECT_OPTIONS: { value: AnimationEffect; label: string }[] = [
  { value: "none", label: "none" },
  { value: "fade_in", label: "fade_in" },
  { value: "fade_out", label: "fade_out" },
  { value: "slide_up", label: "slide_up" },
  { value: "slide_down", label: "slide_down" },
  { value: "slide_left", label: "slide_left" },
  { value: "slide_right", label: "slide_right" },
  { value: "zoom_in", label: "zoom_in" },
  { value: "zoom_out", label: "zoom_out" },
  { value: "pop", label: "pop" },
  { value: "pulse", label: "pulse" },
];

const DURATION_PRESETS = [5, 10, 15];

const ALL_VARIABLES = ["H1", "H2", "H3", "CTA", "Price_Tag", "Illustration", "Image"];

function generateId(): string {
  return `vtpl_${Date.now().toString(36)}`;
}

function buildDefaultAnimations(): AnimationEntry[] {
  return ALL_VARIABLES.map((v) => ({ variable: v, effect: "none", start: 0, end: 1 }));
}

function buildDefaultTemplate(): VideoTemplate {
  return {
    id: generateId(),
    name: "",
    duration: 15,
    createdAt: new Date().toISOString().slice(0, 10),
    exit: { effect: "fade_out", duration: 1.0 },
    animations: buildDefaultAnimations(),
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface VideoTemplatesManagerProps {
  clientId: string;
  initialTemplates: VideoTemplate[];
  readOnly?: boolean;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VideoTemplatesManager({
  clientId,
  initialTemplates,
  readOnly = false,
}: VideoTemplatesManagerProps) {
  const [templates, setTemplates] = useState<VideoTemplate[]>(initialTemplates);
  const [editing, setEditing] = useState<VideoTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // ── Persist to Airtable ───────────────────────────────────────────────────

  const persist = useCallback(
    async (updated: VideoTemplate[]) => {
      setSaving(true);
      setFlash(null);
      try {
        const res = await fetch(`/api/admin/clients/${clientId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoTemplates: JSON.stringify(updated) }),
        });
        if (!res.ok) throw new Error(await res.text());
        setFlash("Saved");
        setTimeout(() => setFlash(null), 2500);
      } catch (err) {
        setFlash(`Error: ${String(err)}`);
      } finally {
        setSaving(false);
      }
    },
    [clientId]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = () => setEditing(buildDefaultTemplate());

  const handleEdit = (tpl: VideoTemplate) => setEditing(JSON.parse(JSON.stringify(tpl)));

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this animation template?")) return;
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    await persist(updated);
  };

  const handleSave = async (tpl: VideoTemplate) => {
    const idx = templates.findIndex((t) => t.id === tpl.id);
    const updated =
      idx >= 0
        ? templates.map((t) => (t.id === tpl.id ? tpl : t))
        : [...templates, tpl];
    setTemplates(updated);
    setEditing(null);
    await persist(updated);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Template list */}
      {templates.length === 0 && (
        <p className="text-sm text-gray-400 italic">No animation templates yet.</p>
      )}
      {templates.map((tpl) => (
        <TemplateCard
          key={tpl.id}
          template={tpl}
          readOnly={readOnly}
          onEdit={() => handleEdit(tpl)}
          onDelete={() => handleDelete(tpl.id)}
        />
      ))}

      {/* Create button */}
      {!readOnly && (
        <button
          onClick={handleCreate}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:border-gray-500 hover:text-gray-900 transition-colors"
        >
          <span className="text-lg leading-none">+</span> Create animation template
        </button>
      )}

      {/* Status */}
      {(saving || flash) && (
        <p
          className={`text-sm ${
            flash?.startsWith("Error") ? "text-red-600" : "text-green-600"
          }`}
        >
          {saving ? "Saving…" : flash}
        </p>
      )}

      {/* Editor modal */}
      {editing && (
        <TemplateEditorModal
          template={editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ── TemplateCard ──────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  readOnly,
  onEdit,
  onDelete,
}: {
  template: VideoTemplate;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const activeAnimations = template.animations.filter((a) => a.effect !== "none");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{template.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Duration: {template.duration}s · {activeAnimations.length} animation
            {activeAnimations.length !== 1 ? "s" : ""}
          </p>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onEdit}
              className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="rounded-md border border-red-100 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 transition-colors"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Animation rows */}
      {activeAnimations.length > 0 && (
        <div className="rounded-lg bg-gray-50 border border-gray-100 divide-y divide-gray-100">
          {activeAnimations.map((a) => (
            <div
              key={a.variable}
              className="flex items-center gap-3 px-3 py-1.5 text-xs"
            >
              <span className="w-20 font-medium text-gray-700 shrink-0">{a.variable}</span>
              <span className="w-24 font-mono text-indigo-600 shrink-0">{a.effect}</span>
              <span className="text-gray-400">
                {a.start}s → {a.end}s
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Global exit */}
      <p className="text-xs text-gray-400">
        Exit: <span className="font-mono text-gray-600">{template.exit.effect}</span> · last{" "}
        {template.exit.duration}s
      </p>
    </div>
  );
}

// ── TemplateEditorModal ───────────────────────────────────────────────────────

function TemplateEditorModal({
  template,
  onSave,
  onCancel,
}: {
  template: VideoTemplate;
  onSave: (tpl: VideoTemplate) => void;
  onCancel: () => void;
}) {
  const [tpl, setTpl] = useState<VideoTemplate>(template);
  const [customDuration, setCustomDuration] = useState<string>(
    DURATION_PRESETS.includes(tpl.duration) ? "" : String(tpl.duration)
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);

  const isCustomDuration = !DURATION_PRESETS.includes(tpl.duration);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const setAnimation = (variable: string, patch: Partial<AnimationEntry>) => {
    setTpl((prev) => ({
      ...prev,
      animations: prev.animations.map((a) =>
        a.variable === variable ? { ...a, ...patch } : a
      ),
    }));
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!tpl.name.trim()) errs.push("Template name is required.");
    if (tpl.duration <= 0) errs.push("Duration must be > 0.");
    const active = tpl.animations.filter((a) => a.effect !== "none");
    if (active.length === 0) errs.push("At least one variable must have an animation.");
    for (const a of active) {
      if (a.end <= a.start) errs.push(`${a.variable}: end time must be > start time.`);
      if (a.end > tpl.duration) errs.push(`${a.variable}: end time exceeds duration.`);
      if (a.start < 0) errs.push(`${a.variable}: start time must be ≥ 0.`);
    }
    if (tpl.exit.duration <= 0) errs.push("Exit duration must be > 0.");
    if (tpl.exit.duration > tpl.duration) errs.push("Exit duration exceeds total duration.");
    return errs;
  };

  const handleSave = () => {
    const errs = validate();
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    onSave(tpl);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {/* Wide modal: max-w-5xl for two-column layout */}
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">

        {/* Sticky header */}
        <div className="shrink-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {template.name ? `Edit: ${template.name}` : "New Animation Template"}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col lg:flex-row min-h-0">

            {/* ── LEFT: Editor ── */}
            <div className="flex-1 min-w-0 p-6 space-y-6 lg:border-r lg:border-gray-100 overflow-y-auto">

              {/* Name */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Template name
                </label>
                <input
                  type="text"
                  value={tpl.name}
                  onChange={(e) => setTpl({ ...tpl, name: e.target.value })}
                  placeholder="e.g. Retail Basic 15s"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Duration
                </label>
                <div className="flex flex-wrap gap-2">
                  {DURATION_PRESETS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => { setTpl({ ...tpl, duration: d }); setCustomDuration(""); }}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        tpl.duration === d && !isCustomDuration
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 text-gray-600 hover:border-gray-400"
                      }`}
                    >
                      {d}s
                    </button>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const val = parseFloat(customDuration) || tpl.duration;
                        setTpl({ ...tpl, duration: val });
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        isCustomDuration
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-200 text-gray-600 hover:border-gray-400"
                      }`}
                    >
                      Custom
                    </button>
                    {isCustomDuration && (
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={customDuration}
                        onChange={(e) => {
                          setCustomDuration(e.target.value);
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0) setTpl({ ...tpl, duration: val });
                        }}
                        className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Variable animations table */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Variable animations
                </label>
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-24">Variable</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Effect</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-20">Start (s)</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-20">End (s)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {tpl.animations.map((a) => {
                        const isActive = a.effect !== "none";
                        return (
                          <tr key={a.variable} className={isActive ? "bg-white" : "bg-gray-50/50"}>
                            <td className="px-3 py-2 font-medium text-gray-700 text-xs">{a.variable}</td>
                            <td className="px-3 py-2">
                              <select
                                value={a.effect}
                                onChange={(e) =>
                                  setAnimation(a.variable, { effect: e.target.value as AnimationEffect })
                                }
                                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
                              >
                                {EFFECT_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              {isActive ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={tpl.duration}
                                  step={0.1}
                                  value={a.start}
                                  onChange={(e) =>
                                    setAnimation(a.variable, { start: parseFloat(e.target.value) || 0 })
                                  }
                                  className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-gray-900"
                                />
                              ) : (
                                <span className="text-gray-300 text-xs px-2">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {isActive ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={tpl.duration}
                                  step={0.1}
                                  value={a.end}
                                  onChange={(e) =>
                                    setAnimation(a.variable, { end: parseFloat(e.target.value) || 0 })
                                  }
                                  className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-gray-900"
                                />
                              ) : (
                                <span className="text-gray-300 text-xs px-2">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Global exit */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Global exit
                </label>
                <div className="flex items-center gap-3">
                  <select
                    value={tpl.exit.effect}
                    onChange={(e) =>
                      setTpl({ ...tpl, exit: { ...tpl.exit, effect: e.target.value as AnimationEffect } })
                    }
                    className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {EFFECT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-gray-400">last</span>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={tpl.exit.duration}
                    onChange={(e) =>
                      setTpl({
                        ...tpl,
                        exit: { ...tpl.exit, duration: parseFloat(e.target.value) || 1 },
                      })
                    }
                    className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <span className="text-sm text-gray-400">seconds</span>
                </div>
              </div>

              {/* Timeline preview (collapsible) */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowTimeline((v) => !v)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                >
                  {showTimeline ? "Hide timeline" : "Preview timeline"}
                </button>
                {showTimeline && (
                  <AnimationTimeline template={tpl} />
                )}
              </div>

              {/* Validation errors */}
              {errors.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
                  {errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">
                      {e}
                    </p>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSave}
                  className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={onCancel}
                  className="rounded-lg border border-gray-200 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* ── RIGHT: Live Preview ── */}
            <div className="w-full lg:w-[420px] xl:w-[460px] shrink-0 p-6 bg-gray-50/50 overflow-y-auto">
              <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-4">
                Live preview
              </p>
              <AnimationPreviewPanel template={tpl} />
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ── AnimationTimeline ─────────────────────────────────────────────────────────

function AnimationTimeline({ template }: { template: VideoTemplate }) {
  const activeAnimations = template.animations.filter((a) => a.effect !== "none");
  const dur = template.duration;
  const COLORS = [
    "bg-indigo-400", "bg-violet-400", "bg-sky-400", "bg-emerald-400",
    "bg-amber-400", "bg-rose-400", "bg-teal-400",
  ];

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
      <p className="text-xs font-medium text-gray-500 mb-2">
        Timeline (0 → {dur}s)
      </p>
      {activeAnimations.map((a, i) => {
        const leftPct = (a.start / dur) * 100;
        const widthPct = ((a.end - a.start) / dur) * 100;
        return (
          <div key={a.variable} className="flex items-center gap-2">
            <span className="text-xs text-gray-600 w-20 shrink-0">{a.variable}</span>
            <div className="relative flex-1 h-5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`absolute top-0 h-full rounded-full ${COLORS[i % COLORS.length]}`}
                style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 1)}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-400 w-16 text-right shrink-0">
              {a.start}s–{a.end}s
            </span>
          </div>
        );
      })}
      {/* Exit bar */}
      {template.exit.effect !== "none" && (
        <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
          <span className="text-xs text-gray-400 w-20 shrink-0 italic">exit</span>
          <div className="relative flex-1 h-5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="absolute top-0 h-full rounded-full bg-gray-400"
              style={{
                left: `${((dur - template.exit.duration) / dur) * 100}%`,
                width: `${(template.exit.duration / dur) * 100}%`,
              }}
            />
          </div>
          <span className="text-[10px] text-gray-400 w-16 text-right shrink-0">
            {(dur - template.exit.duration).toFixed(1)}s–{dur}s
          </span>
        </div>
      )}
    </div>
  );
}
