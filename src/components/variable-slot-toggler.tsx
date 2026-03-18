"use client";
import { useState } from "react";

const DEFAULT_SLOTS = [
  { slot: "H1",           description: "Text — main headline" },
  { slot: "H2",           description: "Text — subheadline" },
  { slot: "H3",           description: "Text — body / brand" },
  { slot: "CTA",          description: "Text — call-to-action" },
  { slot: "Price_Tag",    description: "Text — price / discount" },
  { slot: "Illustration", description: "Asset — product image" },
  { slot: "Image",        description: "Asset — background / secondary" },
];

interface Props {
  clientId: string;
  /** Array of enabled slot names, e.g. ["H1","H2","CTA"] */
  initialEnabled: string[];
}

export default function VariableSlotToggler({ clientId, initialEnabled }: Props) {
  const [enabled, setEnabled] = useState<Set<string>>(
    new Set(initialEnabled.length > 0 ? initialEnabled : DEFAULT_SLOTS.map((s) => s.slot))
  );
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const toggle = (slot: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setFlash(null);
    try {
      // Store as clientVariables JSON — just slot names, no labels
      // (labels live in Format Templates now)
      const slots = Array.from(enabled);
      const clientVariables = JSON.stringify(slots.map((slot) => ({ slot, label: slot })));
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientVariables }),
      });
      if (!res.ok) throw new Error("Save failed");
      setFlash("Variable slots saved");
    } catch {
      setFlash("Error saving — please try again");
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 3000);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="mb-5">
        <h2 className="text-base font-medium text-gray-900">Available variable slots</h2>
        <p className="text-sm text-gray-500 mt-1">
          Toggle which variable slots are available for this client. Enabled slots appear in
          Format Templates and the Campaign Builder.
        </p>
      </div>

      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
        {DEFAULT_SLOTS.map(({ slot, description }) => {
          const on = enabled.has(slot);
          return (
            <label
              key={slot}
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
            >
              {/* Toggle switch */}
              <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggle(slot)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  on ? "bg-gray-900" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    on ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <span className={`text-sm font-mono font-medium w-24 ${on ? "text-gray-900" : "text-gray-400"}`}>
                {slot}
              </span>
              <span className={`text-sm ${on ? "text-gray-600" : "text-gray-400"}`}>
                {description}
              </span>
            </label>
          );
        })}
      </div>

      {/* Add custom variable — deferred */}
      <div className="mt-4">
        <button
          type="button"
          disabled
          title="Coming soon"
          className="text-sm text-gray-400 cursor-not-allowed flex items-center gap-1"
        >
          <span className="text-base leading-none">+</span>
          <span>Add custom variable</span>
          <span className="ml-1 text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
            Coming soon
          </span>
        </button>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Note: labels are set per Format Template, not here.
      </p>

      {/* Save */}
      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {flash && (
          <span className={`text-sm ${flash.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
            {flash}
          </span>
        )}
      </div>
    </div>
  );
}
