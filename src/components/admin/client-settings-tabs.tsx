"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FormatPicker from "@/components/format-picker";
import VariableLabelsEditor from "@/components/variable-labels-editor";
import TemplatesManager from "@/components/templates-manager";
import type { ClientRecord } from "@/lib/airtable-clients";
import type { AirtableFormat } from "@/lib/airtable-campaigns";
import type { CampaignTemplate } from "@/app/api/clients/[clientId]/templates/route";

const TABS = [
  { id: "general", label: "General" },
  { id: "formats", label: "Formats" },
  { id: "variables", label: "Variables" },
  { id: "templates", label: "Templates" },
  { id: "figma", label: "Figma" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const LANGUAGE_OPTIONS = ["ET", "EN", "RU", "LV", "LT"];

interface Props {
  clientId: string;
  client: ClientRecord;
  formats: AirtableFormat[];
  variableSlots: string[];
  activeTab: string;
  baseUrl: string;
  /** If provided, only these tab IDs are shown. Defaults to all tabs. */
  allowedTabs?: string[];
}

export default function ClientSettingsTabs({
  clientId,
  client,
  formats,
  variableSlots: _variableSlots, // eslint-disable-line @typescript-eslint/no-unused-vars
  activeTab: initialTab,
  baseUrl,
  allowedTabs,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>(
    (TABS.find((t) => t.id === initialTab)?.id ?? "general") as TabId
  );

  const visibleTabs = allowedTabs
    ? TABS.filter((t) => allowedTabs.includes(t.id))
    : TABS;

  // ── General tab state ──────────────────────────────────────────────────────
  const [generalData, setGeneralData] = useState({
    clientName: client.name,
    subdomain: client.subdomain,
    status: client.status === "Archived" ? "Draft" : client.status,
    languages: client.languages,
    campaignFilter: client.campaignFilter,
    notes: client.notes,
    primaryColor: client.primaryColor,
    secondaryColor: client.secondaryColor,
    accentColor: client.accentColor,
    backgroundColor: client.backgroundColor,
    logoUrl: client.logoUrl,
  });
  const [generalSaving, setGeneralSaving] = useState(false);
  const [generalFlash, setGeneralFlash] = useState<string | null>(null);

  // ── Formats tab state ──────────────────────────────────────────────────────
  const [selectedFormatIds, setSelectedFormatIds] = useState<string[]>(client.formatIds);
  const [formatsSaving, setFormatsSaving] = useState(false);
  const [formatsFlash, setFormatsFlash] = useState<string | null>(null);

  // ── Figma tab state ────────────────────────────────────────────────────────
  const [figmaAssetFile, setFigmaAssetFile] = useState(client.figmaAssetFile);
  const [figmaSaving, setFigmaSaving] = useState(false);
  const [figmaFlash, setFigmaFlash] = useState<string | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const setTab = (id: TabId) => {
    setActiveTab(id);
    router.replace(`${baseUrl}?tab=${id}`, { scroll: false });
  };

  const toggleLanguage = (lang: string) => {
    setGeneralData((prev) => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter((l) => l !== lang)
        : [...prev.languages, lang],
    }));
  };

  // ── Save handlers ──────────────────────────────────────────────────────────
  const saveGeneral = async () => {
    setGeneralSaving(true);
    setGeneralFlash(null);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generalData),
      });
      if (!res.ok) throw new Error(await res.text());
      setGeneralFlash("Changes saved");
    } catch (err) {
      setGeneralFlash(`Error: ${String(err)}`);
    } finally {
      setGeneralSaving(false);
    }
  };

  const saveFormats = async () => {
    setFormatsSaving(true);
    setFormatsFlash(null);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedFormatIds }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFormatsFlash("Formats saved");
    } catch (err) {
      setFormatsFlash(`Error: ${String(err)}`);
    } finally {
      setFormatsSaving(false);
    }
  };

  const saveFigma = async () => {
    setFigmaSaving(true);
    setFigmaFlash(null);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ figmaAssetFile }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFigmaFlash("Figma settings saved");
    } catch (err) {
      setFigmaFlash(`Error: ${String(err)}`);
    } finally {
      setFigmaSaving(false);
    }
  };

  // ── Templates data for TemplatesManager ────────────────────────────────────
  const templatesClients = [
    {
      id: clientId,
      name: client.name,
      subdomain: client.subdomain,
      templates: client.clientTemplates as CampaignTemplate[],
    },
  ];

  return (
    <div>
      {/* Tab navigation */}
      <nav className="flex gap-1 border-b border-gray-200 mb-6">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "text-gray-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gray-900"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Tab: General ──────────────────────────────────────────────────── */}
      {activeTab === "general" && (
        <div className="max-w-2xl space-y-5">
          {/* Client name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client name</label>
            <input
              type="text"
              value={generalData.clientName}
              onChange={(e) => setGeneralData((p) => ({ ...p, clientName: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          {/* Subdomain */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={generalData.subdomain}
                onChange={(e) => setGeneralData((p) => ({ ...p, subdomain: e.target.value }))}
                className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
              <span className="text-sm text-gray-400">.menteproduction.com</span>
            </div>
          </div>
          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={generalData.status}
              onChange={(e) => setGeneralData((p) => ({ ...p, status: e.target.value as "Draft" | "Active" }))}
              className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="Draft">Draft</option>
              <option value="Active">Active</option>
            </select>
          </div>
          {/* Languages */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Languages</label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggleLanguage(lang)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                    generalData.languages.includes(lang)
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
          {/* Campaign filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign filter</label>
            <input
              type="text"
              value={generalData.campaignFilter}
              onChange={(e) => setGeneralData((p) => ({ ...p, campaignFilter: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            <p className="mt-1 text-xs text-gray-400">
              Airtable filter — campaigns matching this name appear for this client.
            </p>
          </div>
          {/* Logo URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
            <input
              type="text"
              value={generalData.logoUrl}
              onChange={(e) => setGeneralData((p) => ({ ...p, logoUrl: e.target.value }))}
              placeholder="https://..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          {/* Brand colours */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Brand colours</label>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["primaryColor", "Primary"],
                  ["secondaryColor", "Secondary"],
                  ["accentColor", "Accent"],
                  ["backgroundColor", "Background"],
                ] as [keyof typeof generalData, string][]
              ).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={(generalData[key] as string) || "#000000"}
                    onChange={(e) => setGeneralData((p) => ({ ...p, [key]: e.target.value }))}
                    className="h-8 w-10 cursor-pointer rounded border border-gray-300 p-0.5"
                  />
                  <input
                    type="text"
                    value={(generalData[key] as string) || ""}
                    onChange={(e) => setGeneralData((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder="#000000"
                    className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                  <span className="text-xs text-gray-400">{label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={generalData.notes}
              onChange={(e) => setGeneralData((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          {/* Save */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={saveGeneral}
              disabled={generalSaving}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {generalSaving ? "Saving…" : "Save changes"}
            </button>
            {generalFlash && (
              <span className={`text-sm ${generalFlash.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
                {generalFlash}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Formats ──────────────────────────────────────────────────── */}
      {activeTab === "formats" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-medium text-gray-900">Client Formats</h2>
            <p className="mt-1 text-sm text-gray-500">
              Select the formats available to this client. These are drawn from the Master Formats library.
            </p>
          </div>
          <FormatPicker
            formats={formats}
            selected={selectedFormatIds}
            onChange={setSelectedFormatIds}
          />
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={saveFormats}
              disabled={formatsSaving}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {formatsSaving ? "Saving…" : "Save formats"}
            </button>
            {formatsFlash && (
              <span className={`text-sm ${formatsFlash.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
                {formatsFlash}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Variables ────────────────────────────────────────────────── */}
      {activeTab === "variables" && (
        <div className="max-w-2xl">
          <VariableLabelsEditor
            clientId={clientId}
            clientName={client.name}
            initialVariables={client.clientVariables}
          />
        </div>
      )}

      {/* ── Tab: Templates ────────────────────────────────────────────────── */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-medium text-gray-900">Campaign Templates</h2>
            <p className="mt-1 text-sm text-gray-500">
              Saved campaign templates for {client.name}. Templates can be applied when creating new campaigns.
            </p>
          </div>
          <TemplatesManager clients={templatesClients} />
        </div>
      )}

      {/* ── Tab: Figma ────────────────────────────────────────────────────── */}
      {activeTab === "figma" && (
        <div className="max-w-2xl space-y-5">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
            <p className="font-medium mb-1">Figma asset library setup</p>
            <p>
              Create a Figma file named <strong>{client.name} — Asset Library</strong> with
              top-level frames: <code>Backgrounds/</code>, <code>Illustrations/</code>,{" "}
              <code>Logos/</code>, <code>Overlays/</code>, <code>Products/</code>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Figma file key</label>
            <input
              type="text"
              value={figmaAssetFile}
              onChange={(e) => setFigmaAssetFile(e.target.value)}
              placeholder="e.g. abc123XYZ"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
            <p className="mt-1 text-xs text-gray-400">
              Paste the Figma file key from the URL: figma.com/file/<strong>[key]</strong>/...
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={saveFigma}
              disabled={figmaSaving}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {figmaSaving ? "Saving…" : "Save Figma settings"}
            </button>
            {figmaFlash && (
              <span className={`text-sm ${figmaFlash.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
                {figmaFlash}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
