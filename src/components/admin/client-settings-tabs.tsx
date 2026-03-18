"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import FormatPicker from "@/components/format-picker";
import TemplatesManager from "@/components/templates-manager";
import VideoTemplatesManager from "@/components/video-templates-manager";
import type { VideoTemplate } from "@/components/video-templates-manager";
import type { ClientRecord } from "@/lib/airtable-clients";
import type { AirtableFormat } from "@/lib/airtable-campaigns";
import type { CampaignTemplate } from "@/app/api/clients/[clientId]/templates/route";
import ClientUsersManager from "@/components/admin/client-users-manager";
import GenerateVariablesFlow from "@/components/generate-variables-flow";
import VariableSlotToggler from "@/components/variable-slot-toggler";
import FormatTemplatesManager from "@/components/admin/format-templates-manager";
import type { FormatTemplate } from "@/lib/airtable-clients";

const TABS = [
  { id: "general", label: "General" },
  { id: "formats", label: "Formats" },
  { id: "format-templates", label: "Format Templates" },
  { id: "templates", label: "Campaign Templates" },
  { id: "figma", label: "Figma" },
  { id: "users", label: "Users" },
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
  interface FigmaFileEntry {
    key: string;
    name: string;
    owner: string;
    addedAt: string;
  }

  function parseFigmaFiles(raw: string): FigmaFileEntry[] {
    if (!raw || !raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as FigmaFileEntry[];
      // Legacy: single key string
      if (typeof parsed === "string" && parsed.trim()) {
        return [{ key: parsed.trim(), name: "", owner: "", addedAt: new Date().toISOString() }];
      }
    } catch {
      // Legacy: raw key string
      if (raw.trim() && !raw.trim().startsWith("[")) {
        return [{ key: raw.trim(), name: "", owner: "", addedAt: new Date().toISOString() }];
      }
    }
    return [];
  }

  const [figmaFiles, setFigmaFiles] = useState<FigmaFileEntry[]>(() => parseFigmaFiles(client.figmaAssetFile));
  const [figmaSaving, setFigmaSaving] = useState(false);
  const [figmaFlash, setFigmaFlash] = useState<string | null>(null);
  const [newFileKey, setNewFileKey] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [newFileOwner, setNewFileOwner] = useState("");

  // ── Format Templates tab state ─────────────────────────────────────────────
  const initialVideoTemplates: VideoTemplate[] = (client.videoTemplates as VideoTemplate[] | undefined) ?? [];
  const initialFormatTemplates: FormatTemplate[] = (client.formatTemplates as FormatTemplate[] | undefined) ?? [];

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

  const saveFigma = async (files: FigmaFileEntry[]) => {
    setFigmaSaving(true);
    setFigmaFlash(null);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ figmaAssetFile: JSON.stringify(files) }),
      });
      if (!res.ok) throw new Error(await res.text());
      setFigmaFlash("Figma settings saved");
    } catch (err) {
      setFigmaFlash(`Error: ${String(err)}`);
    } finally {
      setFigmaSaving(false);
    }
  };

  const addFigmaFile = async () => {
    const key = newFileKey.trim();
    if (!key) return;
    if (figmaFiles.some((f) => f.key === key)) {
      setFigmaFlash("That file key is already registered.");
      return;
    }
    const entry: FigmaFileEntry = {
      key,
      name: newFileName.trim(),
      owner: newFileOwner.trim(),
      addedAt: new Date().toISOString(),
    };
    const updated = [...figmaFiles, entry];
    setFigmaFiles(updated);
    setNewFileKey("");
    setNewFileName("");
    setNewFileOwner("");
    await saveFigma(updated);
  };

  const removeFigmaFile = async (key: string) => {
    const updated = figmaFiles.filter((f) => f.key !== key);
    setFigmaFiles(updated);
    await saveFigma(updated);
  };

  // ── Templates tab state ──────────────────────────────────────────────────
  const [showGenerateTemplate, setShowGenerateTemplate] = useState(false);
  const hasAiKey = process.env.NEXT_PUBLIC_HAS_ANTHROPIC_KEY === "1";

  // ── Templates data for TemplatesManager ────────────────────────────────────
  const templatesClients = [
    {
      id: clientId,
      name: client.name,
      subdomain: client.subdomain,
      templates: client.clientTemplates as CampaignTemplate[],
    },
  ];

  // ── Derive initial enabled variable slots from clientVariables ─────────────
  const initialEnabledSlots = client.clientVariables.map((v) => v.slot);

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

          {/* ── Variable Slots ─────────────────────────────────────────────── */}
          <div className="pt-4 border-t border-gray-100">
            <VariableSlotToggler
              clientId={clientId}
              initialEnabled={initialEnabledSlots}
            />
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

      {/* ── Tab: Format Templates ─────────────────────────────────────────── */}
      {activeTab === "format-templates" && (
        <div className="space-y-8">

          {/* ── FORMAT TEMPLATES section ──────────────────────────────────── */}
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-medium text-gray-900">Format Templates</h2>
              <p className="mt-1 text-sm text-gray-500">
                Define reusable variable configurations for specific formats. Each template sets
                which variable slots are active, their display labels, and optionally links to an
                animation timeline for video exports.
              </p>
            </div>

            <FormatTemplatesManager
              clientId={clientId}
              clientName={client.name}
              clientSubdomain={client.subdomain}
              initialTemplates={initialFormatTemplates}
              allFormats={formats}
              animationTemplates={initialVideoTemplates}
              hasAiKey={hasAiKey}
            />
          </div>

          {/* ── Divider ───────────────────────────────────────────────────── */}
          <div className="border-t border-gray-200" />

          {/* ── ANIMATION LIBRARY section ─────────────────────────────────── */}
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-medium text-gray-900">Animation Library</h2>
              <p className="mt-1 text-sm text-gray-500">
                Reusable animation timelines for video banner exports. Each timeline controls which
                variable layers animate, their effect, and timing. Video format templates reference
                these timelines.
              </p>
            </div>

            <VideoTemplatesManager
              clientId={clientId}
              initialTemplates={initialVideoTemplates}
            />

            <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm text-amber-700">
              <p className="font-medium mb-1">How video export works</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Mark a format as <strong>Is Video</strong> in the Formats table in Airtable.</li>
                <li>Create an animation timeline above, then link it to a video format template.</li>
                <li>In the Figma plugin, use <strong>Export video</strong> to send layer data to the platform.</li>
                <li>The platform renders a WebM video per banner and stores the URL in <code>Video_URL</code>.</li>
              </ol>
            </div>
          </div>

        </div>
      )}

      {/* ── Tab: Campaign Templates ───────────────────────────────────────── */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-medium text-gray-900">Campaign Templates</h2>
              <p className="mt-1 text-sm text-gray-500">
                Saved campaign templates for {client.name}. Templates can be applied when creating new campaigns.
              </p>
            </div>
            {hasAiKey && (
              <button
                onClick={() => setShowGenerateTemplate(true)}
                className="shrink-0 flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Generate from banner
              </button>
            )}
          </div>
          <TemplatesManager clients={templatesClients} />
          {showGenerateTemplate && (
            <GenerateVariablesFlow
              clientName={client.name}
              clientId={clientId}
              clientFormats={formats}
              mode="template"
              onApply={() => { router.refresh(); }}
              onClose={() => setShowGenerateTemplate(false)}
            />
          )}
        </div>
      )}

      {/* ── Tab: Figma ────────────────────────────────────────────────────── */}
      {activeTab === "figma" && (
        <div className="max-w-2xl space-y-6">

          {/* Registered Figma files list */}
          <div>
            <h2 className="text-base font-medium text-gray-900 mb-1">Registered Figma files</h2>
            <p className="text-sm text-gray-500 mb-3">
              Files registered here are shown in the Figma plugin after selecting this client.
              The plugin uses these to help designers navigate to the correct file.
            </p>

            {figmaFiles.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No files registered yet.</p>
            ) : (
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {figmaFiles.map((f) => (
                  <div key={f.key} className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {f.name || <span className="text-gray-400 italic">Unnamed file</span>}
                      </p>
                      <p className="text-xs font-mono text-gray-500 mt-0.5 truncate">{f.key}</p>
                      {f.owner && (
                        <p className="text-xs text-gray-400 mt-0.5">Owner: {f.owner}</p>
                      )}
                    </div>
                    <a
                      href={`https://www.figma.com/file/${f.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex-shrink-0 mt-0.5"
                    >
                      Open ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => removeFigmaFile(f.key)}
                      disabled={figmaSaving}
                      className="text-xs text-red-500 hover:text-red-700 flex-shrink-0 mt-0.5 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add new file form */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Add a Figma file</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">File key <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newFileKey}
                  onChange={(e) => setNewFileKey(e.target.value)}
                  placeholder="abc123XYZ"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
                <p className="mt-0.5 text-xs text-gray-400">From figma.com/file/<strong>[key]</strong>/</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">File name</label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="e.g. Avene — Banner Designs"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Owner / designer</label>
              <input
                type="text"
                value={newFileOwner}
                onChange={(e) => setNewFileOwner(e.target.value)}
                placeholder="e.g. Mari Tamm"
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={addFigmaFile}
                disabled={figmaSaving || !newFileKey.trim()}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {figmaSaving ? "Saving…" : "Add file"}
              </button>
              {figmaFlash && (
                <span className={`text-sm ${figmaFlash.startsWith("Error") || figmaFlash.startsWith("That") ? "text-red-600" : "text-green-600"}`}>
                  {figmaFlash}
                </span>
              )}
            </div>
          </div>

          {/* Legacy info box */}
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
            <p className="font-medium mb-1">Figma asset library naming convention</p>
            <p>
              Recommended file name: <strong>{client.name} — Asset Library</strong> with
              top-level frames: <code>Backgrounds/</code>, <code>Illustrations/</code>,{" "}
              <code>Logos/</code>, <code>Overlays/</code>, <code>Products/</code>
            </p>
          </div>
        </div>
      )}

      {/* ── Tab: Users ────────────────────────────────────────────────────── */}
      {activeTab === "users" && (
        <ClientUsersManager clientId={clientId} />
      )}
    </div>
  );
}
