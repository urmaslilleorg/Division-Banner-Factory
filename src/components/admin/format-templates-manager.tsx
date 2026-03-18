"use client";
import { useState, useCallback } from "react";
import type { AirtableFormat } from "@/lib/airtable-campaigns";
import type { FormatTemplate } from "@/lib/airtable-clients";
import type { VideoTemplate } from "@/components/video-templates-manager";
import GenerateVariablesFlow from "@/components/generate-variables-flow";

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_SLOTS = ["H1", "H2", "H3", "CTA", "Price_Tag", "Illustration", "Image"];

// ── FormatTemplateEditorModal ──────────────────────────────────────────────────

interface EditorModalProps {
  template: FormatTemplate | null; // null = creating new
  allFormats: AirtableFormat[];
  animationTemplates: VideoTemplate[];
  onSave: (tpl: FormatTemplate) => void;
  onCancel: () => void;
}

function FormatTemplateEditorModal({
  template,
  allFormats,
  animationTemplates,
  onSave,
  onCancel,
}: EditorModalProps) {
  const isNew = template === null;
  const [name, setName] = useState(template?.name ?? "");
  const [type, setType] = useState<"still" | "video">(template?.type ?? "still");
  const [formatIds, setFormatIds] = useState<string[]>(template?.formatIds ?? []);
  const [variables, setVariables] = useState<{ slot: string; label: string }[]>(
    template?.variables ??
      DEFAULT_SLOTS.map((s) => ({ slot: s, label: s }))
  );
  const [animationTemplateId, setAnimationTemplateId] = useState<string>(
    template?.animationTemplateId ?? ""
  );

  const toggleFormat = (id: string) => {
    setFormatIds((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const setLabel = (slot: string, label: string) => {
    setVariables((prev) =>
      prev.map((v) => (v.slot === slot ? { ...v, label } : v))
    );
  };

  const toggleVariable = (slot: string) => {
    setVariables((prev) =>
      prev.some((v) => v.slot === slot)
        ? prev.filter((v) => v.slot !== slot)
        : [...prev, { slot, label: slot }]
    );
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const tpl: FormatTemplate = {
      id: template?.id ?? `ftpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      type,
      createdAt: template?.createdAt ?? new Date().toISOString().split("T")[0],
      formatIds,
      variables,
      animationTemplateId: type === "video" && animationTemplateId ? animationTemplateId : undefined,
    };
    onSave(tpl);
  };

  // Group formats by channel for the picker
  const byChannel: Record<string, AirtableFormat[]> = {};
  for (const f of allFormats) {
    const ch = f.channel || "Other";
    if (!byChannel[ch]) byChannel[ch] = [];
    byChannel[ch].push(f);
  }
  const channels = Object.keys(byChannel).sort();

  const enabledSlots = new Set(variables.map((v) => v.slot));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {isNew ? "New Format Template" : "Edit Format Template"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Product Banner"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <div className="flex gap-3">
              {(["still", "video"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    type === t
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {t === "still" ? "🖼 Still" : "🎬 Video"}
                </button>
              ))}
            </div>
          </div>

          {/* Formats */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Formats
              <span className="ml-1.5 text-xs font-normal text-gray-400">
                ({formatIds.length} selected)
              </span>
            </label>
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-52 overflow-y-auto">
              {channels.map((ch) => (
                <div key={ch}>
                  <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50">
                    {ch}
                  </p>
                  {byChannel[ch].map((f) => (
                    <label
                      key={f.id}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={formatIds.includes(f.id)}
                        onChange={() => toggleFormat(f.id)}
                        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
                      />
                      <span className="text-sm text-gray-700">{f.formatName}</span>
                      <span className="text-xs text-gray-400 ml-auto">
                        {f.widthPx}×{f.heightPx}
                      </span>
                    </label>
                  ))}
                </div>
              ))}
              {allFormats.length === 0 && (
                <p className="px-3 py-4 text-sm text-gray-400 italic">No formats available.</p>
              )}
            </div>
          </div>

          {/* Variables */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Variable slots &amp; labels
            </label>
            <p className="text-xs text-gray-400 mb-3">
              Toggle which slots are active for this template, and set the display label for each.
            </p>
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
              {DEFAULT_SLOTS.map((slot) => {
                const on = enabledSlots.has(slot);
                const entry = variables.find((v) => v.slot === slot);
                return (
                  <div key={slot} className="flex items-center gap-3 px-3 py-2.5">
                    {/* Toggle */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() => toggleVariable(slot)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                        on ? "bg-gray-900" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          on ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                    {/* Slot name */}
                    <span className={`w-24 text-sm font-mono font-medium ${on ? "text-gray-900" : "text-gray-300"}`}>
                      {slot}
                    </span>
                    {/* Label input */}
                    <input
                      type="text"
                      disabled={!on}
                      value={entry?.label ?? slot}
                      onChange={(e) => setLabel(slot, e.target.value)}
                      placeholder={slot}
                      className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-30 disabled:bg-gray-50"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Animation template (video only) */}
          {type === "video" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Animation template
                <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <select
                value={animationTemplateId}
                onChange={(e) => setAnimationTemplateId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                <option value="">— None —</option>
                {animationTemplates.map((at) => (
                  <option key={at.id} value={at.id}>
                    {at.name} ({at.duration}s)
                  </option>
                ))}
              </select>
              {animationTemplates.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  No animation templates yet — create them in the Animation Library below.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {isNew ? "Create template" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FormatTemplateCard ─────────────────────────────────────────────────────────

interface CardProps {
  template: FormatTemplate;
  allFormats: AirtableFormat[];
  animationTemplates: VideoTemplate[];
  onEdit: () => void;
  onDelete: () => void;
}

function FormatTemplateCard({
  template,
  allFormats,
  animationTemplates,
  onEdit,
  onDelete,
}: CardProps) {
  const [expanded, setExpanded] = useState(false);

  const formatNames = template.formatIds
    .map((id) => allFormats.find((f) => f.id === id)?.formatName ?? id)
    .filter(Boolean);

  const animTpl = template.animationTemplateId
    ? animationTemplates.find((a) => a.id === template.animationTemplateId)
    : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 text-left min-w-0"
        >
          <span className="text-gray-400 text-xs select-none">{expanded ? "▼" : "▶"}</span>
          <span className="text-sm font-semibold text-gray-900 truncate">{template.name}</span>
          <span
            className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              template.type === "video"
                ? "bg-indigo-50 text-indigo-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {template.type === "video" ? "🎬 Video" : "🖼 Still"}
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400">
            {formatNames.length} format{formatNames.length !== 1 ? "s" : ""}
          </span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs text-gray-400">
            {template.variables.length} variable{template.variables.length !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={onEdit}
            className="ml-1 rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded border border-red-100 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 transition-colors"
          >
            ×
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          {/* Formats */}
          {formatNames.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
                Formats
              </p>
              <div className="flex flex-wrap gap-1.5">
                {formatNames.map((n) => (
                  <span
                    key={n}
                    className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Variables */}
          {template.variables.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
                Variables
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {template.variables.map((v) => (
                  <div key={v.slot} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-gray-500 w-24 shrink-0">{v.slot}</span>
                    <span className="text-gray-700">{v.label !== v.slot ? v.label : <span className="text-gray-400 italic">same as slot</span>}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Animation link */}
          {template.type === "video" && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
                Animation
              </p>
              {animTpl ? (
                <p className="text-sm text-gray-700">
                  {animTpl.name}{" "}
                  <span className="text-gray-400">({animTpl.duration}s)</span>
                </p>
              ) : (
                <p className="text-sm text-gray-400 italic">No animation linked</p>
              )}
            </div>
          )}

          <p className="text-xs text-gray-400">Created {template.createdAt}</p>
        </div>
      )}
    </div>
  );
}

// ── Main: FormatTemplatesManager ───────────────────────────────────────────────

interface Props {
  clientId: string;
  clientName: string;
  clientSubdomain?: string; // kept for API compatibility, not used internally
  initialTemplates: FormatTemplate[];
  allFormats: AirtableFormat[];
  animationTemplates: VideoTemplate[];
  hasAiKey: boolean;
}

export default function FormatTemplatesManager({
  clientId,
  clientName,
  clientSubdomain: _clientSubdomain, // eslint-disable-line @typescript-eslint/no-unused-vars
  initialTemplates,
  allFormats,
  animationTemplates,
  hasAiKey,
}: Props) {
  const [templates, setTemplates] = useState<FormatTemplate[]>(initialTemplates);
  const [editing, setEditing] = useState<FormatTemplate | null | "new">(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [showGenerateFlow, setShowGenerateFlow] = useState(false);

  // ── Persist ────────────────────────────────────────────────────────────────
  const persist = useCallback(
    async (updated: FormatTemplate[]) => {
      setSaving(true);
      setFlash(null);
      try {
        const res = await fetch(`/api/admin/clients/${clientId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formatTemplates: JSON.stringify(updated) }),
        });
        if (!res.ok) throw new Error("Save failed");
        setFlash("Saved");
      } catch {
        setFlash("Error saving — please try again");
      } finally {
        setSaving(false);
        setTimeout(() => setFlash(null), 3000);
      }
    },
    [clientId]
  );

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const handleSave = (tpl: FormatTemplate) => {
    const updated = templates.some((t) => t.id === tpl.id)
      ? templates.map((t) => (t.id === tpl.id ? tpl : t))
      : [...templates, tpl];
    setTemplates(updated);
    setEditing(null);
    persist(updated);
  };

  const handleDelete = (id: string) => {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    persist(updated);
  };

  // ── GenerateVariablesFlow callback ─────────────────────────────────────────
  // When the AI flow completes in "template" mode it calls onApply with variables.
  // We then refresh the list (the flow already POSTed to /api/clients/[sub]/templates).
  // For FormatTemplates we intercept the flow differently — we open the editor
  // pre-filled with the detected variables.
  const handleGenerateApply = useCallback(
    (variables: { slot: string; label: string }[]) => {
      // Open editor pre-filled with the AI-detected variables
      const draft: FormatTemplate = {
        id: `ftpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: "",
        type: "still",
        createdAt: new Date().toISOString().split("T")[0],
        formatIds: [],
        variables,
      };
      setShowGenerateFlow(false);
      setEditing(draft);
    },
    []
  );

  return (
    <div className="space-y-4">
      {/* Entry point buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:border-gray-500 hover:text-gray-900 transition-colors"
        >
          <span className="text-base leading-none">+</span> New format template
        </button>
        {hasAiKey && (
          <button
            type="button"
            onClick={() => setShowGenerateFlow(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-indigo-200 px-4 py-2 text-sm text-indigo-600 hover:border-indigo-500 hover:text-indigo-900 transition-colors"
          >
            <span className="text-base leading-none">🖼</span> Generate from banner
          </button>
        )}
      </div>

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

      {/* Template cards */}
      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 px-6 py-10 text-center">
          <p className="text-sm text-gray-400">
            No format templates yet. Create one to define variable slots and labels per format.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl) => (
            <FormatTemplateCard
              key={tpl.id}
              template={tpl}
              allFormats={allFormats}
              animationTemplates={animationTemplates}
              onEdit={() => setEditing(tpl)}
              onDelete={() => handleDelete(tpl.id)}
            />
          ))}
        </div>
      )}

      {/* Editor modal */}
      {editing !== null && (
        <FormatTemplateEditorModal
          template={editing === "new" ? null : editing}
          allFormats={allFormats}
          animationTemplates={animationTemplates}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Generate from banner flow */}
      {showGenerateFlow && (
        <GenerateVariablesFlow
          clientName={clientName}
          clientId={clientId}
          clientFormats={allFormats}
          mode="variables"
          onApply={handleGenerateApply}
          onClose={() => setShowGenerateFlow(false)}
        />
      )}
    </div>
  );
}
