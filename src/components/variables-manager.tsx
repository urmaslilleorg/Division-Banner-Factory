"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Loader2, Save } from "lucide-react";

export interface VariableDefinition {
  id: string;
  label: string;
  fields: Record<string, string>;
  type: "text" | "number" | "url";
}

interface VariablesManagerProps {
  initialVariables: VariableDefinition[];
}

const EMPTY_VAR: Omit<VariableDefinition, "id"> = {
  label: "",
  fields: { all: "" },
  type: "text",
};

export default function VariablesManager({ initialVariables }: VariablesManagerProps) {
  const [variables, setVariables] = useState<VariableDefinition[]>(initialVariables);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ ...EMPTY_VAR, fieldMode: "all" as "all" | "per-lang" });
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const saveRegistry = async (updated: VariableDefinition[]) => {
    setIsSaving(true);
    try {
      await fetch("/api/variables", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables: updated }),
      });
      setSavedAt(new Date());
    } finally {
      setIsSaving(false);
    }
  };

  const addVariable = async () => {
    if (!addForm.label.trim()) return;
    const id = addForm.label.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    const fields: Record<string, string> =
      addForm.fieldMode === "per-lang"
        ? { ET: `${id}_ET`, EN: `${id}_EN` }
        : { all: id };
    const newVar: VariableDefinition = { id, label: addForm.label.trim(), fields, type: addForm.type };
    const updated = [...variables, newVar];
    setVariables(updated);
    await saveRegistry(updated);
    setAddForm({ ...EMPTY_VAR, fieldMode: "all" });
    setShowAddForm(false);
  };

  const deleteVariable = async (id: string) => {
    const updated = variables.filter((v) => v.id !== id);
    setVariables(updated);
    await saveRegistry(updated);
    setConfirmDeleteId(null);
  };

  const inputCls = "w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {variables.length} variables
          {savedAt && (
            <span className="ml-2 text-xs text-emerald-600">
              ✓ Saved {savedAt.toLocaleTimeString()}
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {isSaving && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          <Button size="sm" onClick={() => setShowAddForm(true)} disabled={showAddForm}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add variable
          </Button>
        </div>
      </div>

      {/* Variable list */}
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {variables.map((v) => (
          <div key={v.id} className="flex items-start gap-4 px-4 py-3">
            <div className="flex-1 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{v.label}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500">
                  {v.id}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                  v.type === "number" ? "bg-amber-50 text-amber-700" :
                  v.type === "url" ? "bg-purple-50 text-purple-700" :
                  "bg-blue-50 text-blue-700"
                }`}>
                  {v.type}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(v.fields).map(([lang, field]) => (
                  <span key={lang} className="rounded bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
                    {lang === "all" ? "" : <span className="font-medium text-gray-700">{lang}: </span>}
                    <span className="font-mono">{field}</span>
                  </span>
                ))}
              </div>
            </div>
            <div>
              {confirmDeleteId === v.id ? (
                <div className="flex gap-1">
                  <button
                    onClick={() => deleteVariable(v.id)}
                    className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(v.id)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}

        {variables.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No variables defined. Add one above.
          </div>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">New variable</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">Label</label>
              <input
                className={inputCls}
                placeholder="e.g. Price Tag"
                value={addForm.label}
                onChange={(e) => setAddForm((p) => ({ ...p, label: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">Type</label>
              <select
                className={inputCls}
                value={addForm.type}
                onChange={(e) => setAddForm((p) => ({ ...p, type: e.target.value as "text" | "number" | "url" }))}
              >
                <option value="text">text</option>
                <option value="number">number</option>
                <option value="url">url</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">Field mapping</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input type="radio" checked={addForm.fieldMode === "all"}
                  onChange={() => setAddForm((p) => ({ ...p, fieldMode: "all" }))} />
                Single field (language-neutral)
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input type="radio" checked={addForm.fieldMode === "per-lang"}
                  onChange={() => setAddForm((p) => ({ ...p, fieldMode: "per-lang" }))} />
                Per-language fields (ET/EN)
              </label>
            </div>
            <p className="text-xs text-gray-400">
              {addForm.fieldMode === "per-lang"
                ? `Will create fields: {ID}_ET, {ID}_EN`
                : `Will use field: {ID}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addVariable} disabled={isSaving || !addForm.label.trim()}>
              {isSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
              Save variable
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowAddForm(false); setAddForm({ ...EMPTY_VAR, fieldMode: "all" }); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Registry JSON preview */}
      <details className="rounded-lg border border-gray-200">
        <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50">
          View raw Registry_JSON
        </summary>
        <pre className="overflow-x-auto p-4 text-xs text-gray-600 bg-gray-50">
          {JSON.stringify(variables, null, 2)}
        </pre>
      </details>
    </div>
  );
}
