"use client";
import { useState } from "react";
import GenerateVariablesFlow from "@/components/generate-variables-flow";
import { useRouter } from "next/navigation";
import FormatPicker from "@/components/format-picker";
import type { AirtableFormat } from "@/lib/airtable-campaigns";
import type { ClientVariable } from "@/lib/types";

interface Props {
  formats: AirtableFormat[];
  variableSlots?: string[]; // global slot names from Registry
  initialData?: Partial<WizardData>;
  editId?: string; // if set, we're editing an existing client
}

interface WizardData {
  clientName: string;
  subdomain: string;
  status: "Draft" | "Active";
  languages: string[];
  campaignFilter: string;
  notes: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  selectedFormatIds: string[];
  figmaAssetFile: string;
  logoUrl: string;
  // Variables step
  clientVariables: ClientVariable[];
}

const LANGUAGE_OPTIONS = ["ET", "EN", "RU", "LV", "LT"];

const DEFAULT_VARIABLE_SLOTS = ["H1", "H2", "H3", "CTA", "Price_Tag", "Illustration", "Image"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüõ]/g, (c) => ({ ä: "a", ö: "o", ü: "u", õ: "o" }[c] || c))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const STEPS = [
  "Basic info",
  "Brand colours",
  "Formats",
  "Variables",
  "Asset library",
  "Review",
];

export default function NewClientWizard({ formats, variableSlots, initialData, editId }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const slots = variableSlots && variableSlots.length > 0 ? variableSlots : DEFAULT_VARIABLE_SLOTS;
  const [showGenerateFlow, setShowGenerateFlow] = useState(false);
  const hasAiKey = process.env.NEXT_PUBLIC_HAS_ANTHROPIC_KEY === "1";

  // Build default clientVariables from slots (all enabled, label = slot name)
  const defaultClientVariables: ClientVariable[] = slots.map((s) => ({ slot: s, label: s }));

  const [data, setData] = useState<WizardData>({
    clientName: initialData?.clientName || "",
    subdomain: initialData?.subdomain || "",
    status: initialData?.status || "Draft",
    languages: initialData?.languages || ["ET"],
    campaignFilter: initialData?.campaignFilter || "",
    notes: initialData?.notes || "",
    primaryColor: initialData?.primaryColor || "#1A1A2E",
    secondaryColor: initialData?.secondaryColor || "#16213E",
    accentColor: initialData?.accentColor || "#0F3460",
    backgroundColor: initialData?.backgroundColor || "#FFFFFF",
    selectedFormatIds: initialData?.selectedFormatIds || [],
    figmaAssetFile: initialData?.figmaAssetFile || "",
    logoUrl: initialData?.logoUrl || "",
    clientVariables: initialData?.clientVariables && initialData.clientVariables.length > 0
      ? initialData.clientVariables
      : defaultClientVariables,
  });

  const set = (key: keyof WizardData, value: unknown) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const handleNameChange = (name: string) => {
    setData((prev) => ({
      ...prev,
      clientName: name,
      subdomain: prev.subdomain || slugify(name),
      campaignFilter: prev.campaignFilter || name,
    }));
  };

  const toggleLanguage = (lang: string) => {
    setData((prev) => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter((l) => l !== lang)
        : [...prev.languages, lang],
    }));
  };

  // ── Variables step helpers ───────────────────────────────────────────────

  /** Whether a slot is currently enabled (present in clientVariables) */
  const isSlotEnabled = (slot: string) =>
    data.clientVariables.some((v) => v.slot === slot);

  /** Get the current label for a slot */
  const getSlotLabel = (slot: string) =>
    data.clientVariables.find((v) => v.slot === slot)?.label ?? slot;

  const toggleSlot = (slot: string) => {
    setData((prev) => {
      const enabled = prev.clientVariables.some((v) => v.slot === slot);
      if (enabled) {
        return { ...prev, clientVariables: prev.clientVariables.filter((v) => v.slot !== slot) };
      } else {
        return {
          ...prev,
          clientVariables: [...prev.clientVariables, { slot, label: slot }],
        };
      }
    });
  };

  const setSlotLabel = (slot: string, label: string) => {
    setData((prev) => ({
      ...prev,
      clientVariables: prev.clientVariables.map((v) =>
        v.slot === slot ? { ...v, label } : v
      ),
    }));
  };

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    try {
      const url = editId
        ? `/api/admin/clients/${editId}`
        : "/api/admin/clients/create";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          clientVariables: JSON.stringify(data.clientVariables),
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to save client");
      }
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSaving(false);
    }
  };

  const lastStep = STEPS.length - 1;

  return (
    <div className="max-w-2xl">
      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center">
            <button
              onClick={() => setStep(i)}
              title={label}
              aria-label={`Go to step ${i + 1}: ${label}`}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                i === step
                  ? "bg-gray-900 text-white ring-2 ring-gray-900 ring-offset-2"
                  : i < step
                  ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  : "bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
              }`}
            >
              {i < step ? (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </button>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-8 ${i < step ? "bg-gray-300" : "bg-gray-100"}`} />
            )}
          </div>
        ))}
        <span className="ml-4 text-sm font-medium text-gray-700">{STEPS[step]}</span>
      </div>

      {/* Step 0 — Basic info */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client name</label>
            <input
              type="text"
              value={data.clientName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Avene"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={data.subdomain}
                onChange={(e) => set("subdomain", e.target.value)}
                placeholder="avene"
                className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
              <span className="text-sm text-gray-400">.menteproduction.com</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={data.status}
              onChange={(e) => set("status", e.target.value)}
              className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="Draft">Draft</option>
              <option value="Active">Active</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Languages</label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggleLanguage(lang)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                    data.languages.includes(lang)
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign filter</label>
            <input
              type="text"
              value={data.campaignFilter}
              onChange={(e) => set("campaignFilter", e.target.value)}
              placeholder="e.g. Avene"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            <p className="mt-1 text-xs text-gray-400">
              Airtable filter string — campaigns matching this name will appear for this client.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={data.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
        </div>
      )}

      {/* Step 1 — Brand colours */}
      {step === 1 && (
        <div className="space-y-4">
          {(
            [
              ["primaryColor", "Primary colour"],
              ["secondaryColor", "Secondary colour"],
              ["accentColor", "Accent colour"],
              ["backgroundColor", "Background colour"],
            ] as [keyof WizardData, string][]
          ).map(([key, label]) => (
            <div key={key} className="flex items-center gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={(data[key] as string) || "#000000"}
                    onChange={(e) => set(key, e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded border border-gray-300 p-0.5"
                  />
                  <input
                    type="text"
                    value={(data[key] as string) || ""}
                    onChange={(e) => set(key, e.target.value)}
                    placeholder="#1A1A2E"
                    className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                  <div
                    className="h-9 w-9 rounded-md border border-gray-200"
                    style={{ backgroundColor: (data[key] as string) || "#ffffff" }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Step 2 — Formats */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Select the formats available to this client.
          </p>
          <FormatPicker
            formats={formats}
            selected={data.selectedFormatIds}
            onChange={(ids) => setData((prev) => ({ ...prev, selectedFormatIds: ids }))}
          />
        </div>
      )}

      {/* Step 3 — Variables */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-medium text-gray-900">Variables</h2>
            <p className="mt-1 text-sm text-gray-500">
              Define the copy variables for this client. Select which slots to use and give each a custom label.
            </p>
          </div>
          {hasAiKey && (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setShowGenerateFlow(true)}
                className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Generate from banner
              </button>
              <span className="ml-3 text-xs text-gray-400">or configure manually below</span>
            </div>
          )}
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {slots.map((slot) => {
              const enabled = isSlotEnabled(slot);
              return (
                <div key={slot} className="flex items-center gap-4 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleSlot(slot)}
                    className="h-4 w-4 rounded border-gray-300 text-gray-900 cursor-pointer"
                  />
                  <span className="w-28 text-sm text-gray-400 font-mono">{slot}</span>
                  <div className="flex-1">
                    <input
                      type="text"
                      value={enabled ? getSlotLabel(slot) : slot}
                      disabled={!enabled}
                      onChange={(e) => setSlotLabel(slot, e.target.value)}
                      placeholder={slot}
                      className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400">
            Only checked slots will be saved and shown in the Campaign Builder and Copy Editor.
          </p>
        </div>
      )}

      {/* Generate Variables Flow modal */}
      {showGenerateFlow && (
        <GenerateVariablesFlow
          clientName={data.clientName || "New Client"}
          onApply={(variables) => {
            // Pre-fill wizard Step 3 with AI-detected variables
            setData((prev) => ({ ...prev, clientVariables: variables }));
          }}
          onClose={() => setShowGenerateFlow(false)}
        />
      )}

      {/* Step 4 — Asset library */}
      {step === 4 && (
        <div className="space-y-5">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
            <p className="font-medium mb-1">Figma asset library setup</p>
            <p>
              Create a Figma file named{" "}
              <strong>{data.clientName || "[ClientName]"} — Asset Library</strong> with
              top-level frames: <code>Backgrounds/</code>, <code>Illustrations/</code>,{" "}
              <code>Logos/</code>, <code>Overlays/</code>, <code>Products/</code>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Figma file key
            </label>
            <input
              type="text"
              value={data.figmaAssetFile}
              onChange={(e) => set("figmaAssetFile", e.target.value)}
              placeholder="e.g. abc123XYZ"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            <p className="mt-1 text-xs text-gray-400">
              Paste the Figma file key for this client&apos;s asset library (from the URL:
              figma.com/file/<strong>[key]</strong>/...).
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
            <input
              type="text"
              value={data.logoUrl}
              onChange={(e) => set("logoUrl", e.target.value)}
              placeholder="https://..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
        </div>
      )}

      {/* Step 5 — Review */}
      {step === 5 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {[
              ["Client name", data.clientName],
              ["Subdomain", `${data.subdomain}.menteproduction.com`],
              ["Status", data.status],
              ["Languages", data.languages.join(", ") || "—"],
              ["Campaign filter", data.campaignFilter || "—"],
              ["Primary colour", data.primaryColor],
              ["Formats selected", `${data.selectedFormatIds.length} formats`],
              ["Variables", `${data.clientVariables.length} slot${data.clientVariables.length !== 1 ? "s" : ""} enabled`],
              ["Figma asset file", data.figmaAssetFile || "—"],
              ["Logo URL", data.logoUrl || "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-gray-500">{label}</span>
                <span className="text-sm font-medium text-gray-900 max-w-xs truncate text-right">
                  {value}
                </span>
              </div>
            ))}
          </div>
          {error && (
            <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={() => (step === 0 ? router.push("/admin") : setStep(step - 1))}
          className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {step === 0 ? "Cancel" : "Back"}
        </button>
        {step < lastStep ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : editId ? "Save changes" : "Create Client"}
          </button>
        )}
      </div>
    </div>
  );
}
