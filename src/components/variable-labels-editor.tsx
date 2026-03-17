"use client";

import { useState } from "react";
import type { ClientVariable } from "@/lib/types";
import GenerateVariablesFlow from "@/components/generate-variables-flow";

const DEFAULT_SLOTS = ["H1", "H2", "H3", "CTA", "Price_Tag", "Illustration", "Image"];

interface Props {
  clientId: string;
  clientName: string;
  initialVariables: ClientVariable[];
}

export default function VariableLabelsEditor({
  clientId,
  clientName,
  initialVariables,
}: Props) {
  // Build a slot→label map from initialVariables; fill missing slots with ""
  const buildMap = (vars: ClientVariable[]) => {
    const m: Record<string, string> = {};
    for (const slot of DEFAULT_SLOTS) {
      const cv = vars.find((v) => v.slot === slot);
      m[slot] = cv ? cv.label : "";
    }
    return m;
  };

  const [labels, setLabels] = useState<Record<string, string>>(
    buildMap(initialVariables)
  );
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [showGenerateFlow, setShowGenerateFlow] = useState(false);

  const hasAiKey = process.env.NEXT_PUBLIC_HAS_ANTHROPIC_KEY === "1";

  const handleSave = async () => {
    setSaving(true);
    setFlash(null);
    // Build array — include all slots that have a non-empty label
    const variableArray: ClientVariable[] = DEFAULT_SLOTS.map((slot) => ({
      slot,
      label: labels[slot] || slot, // fallback to slot name if blank
    }));
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientVariables: JSON.stringify(variableArray),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFlash("Variable labels saved");
    } catch (err) {
      setFlash(`Error: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const m: Record<string, string> = {};
    for (const slot of DEFAULT_SLOTS) m[slot] = "";
    setLabels(m);
    setFlash(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Variable Labels for {clientName}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Map each global variable slot to a client-specific display name.
          Leave blank to use the default slot name.
        </p>
      </div>

      {/* Generate from banner button */}
      {hasAiKey && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowGenerateFlow(true)}
            className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span>🖼</span>
            Generate from banner
          </button>
          <span className="text-xs text-gray-400">or configure manually below</span>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600 w-1/3">
                Slot
              </th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">
                Display Label
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {DEFAULT_SLOTS.map((slot) => (
              <tr key={slot}>
                <td className="px-4 py-2 font-mono text-gray-500">{slot}</td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={labels[slot]}
                    onChange={(e) =>
                      setLabels((prev) => ({ ...prev, [slot]: e.target.value }))
                    }
                    placeholder={slot}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          In the Copy &amp; Assets tab, H1 column will show as &ldquo;
          {labels["H1"] || "H1"}&rdquo;
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            disabled={saving}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {flash && (
        <p
          className={`text-sm ${
            flash.startsWith("Error") ? "text-red-600" : "text-green-600"
          }`}
        >
          {flash}
        </p>
      )}

      {/* Generate Variables Flow modal */}
      {showGenerateFlow && (
        <GenerateVariablesFlow
          clientName={clientName}
          clientId={clientId}
          onApply={(variables) => {
            // Update the labels map from AI result
            const newMap = buildMap(variables);
            setLabels(newMap);
            setFlash("Variables updated from banner analysis");
          }}
          onClose={() => setShowGenerateFlow(false)}
        />
      )}
    </div>
  );
}
