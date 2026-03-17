"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AdminFormatManager from "@/components/admin/admin-format-manager";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Counts {
  activeClients: number;
  totalCampaigns: number;
  totalBanners: number;
  activeUsers: number;
}

interface Integrations {
  airtable: boolean;
  vercelBlob: boolean;
  figma: boolean;
  resend: boolean;
  anthropic: boolean;
}

interface EmailConfig {
  fromAddress: string | null;
}

interface Language {
  code: string;
  name: string;
  enabled: boolean;
  isDefault?: boolean;
}

interface NotificationRule {
  id: string;
  trigger: string;
  description: string;
  recipients: string;
  enabled: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlatformConfig = Record<string, any>;

interface FormatRow {
  id: string;
  formatName: string;
  channel: string;
  device: string;
  width: number;
  height: number;
  safeArea: string;
  outputFormat: string;
  figmaFrameBase: string;
  usedBy: string[];
}

interface Props {
  initialTab: string;
  counts: Counts;
  config: PlatformConfig;
  integrations: Integrations;
  email: EmailConfig;
  formatsData: FormatRow[];
  pluginVersion: string;
  pluginUpdated: string;
  appDomain: string;
}

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { id: "general", label: "General" },
  { id: "formats", label: "Formats" },
  { id: "languages", label: "Languages" },
  { id: "integrations", label: "Integrations" },
  { id: "email", label: "Email" },
  { id: "branding", label: "Branding" },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ── Default language list ─────────────────────────────────────────────────────
const DEFAULT_LANGUAGES: Language[] = [
  { code: "ET", name: "Estonian", enabled: true, isDefault: true },
  { code: "EN", name: "English", enabled: true },
  { code: "RU", name: "Russian", enabled: true },
  { code: "LV", name: "Latvian", enabled: true },
  { code: "LT", name: "Lithuanian", enabled: true },
  { code: "FI", name: "Finnish", enabled: false },
  { code: "SV", name: "Swedish", enabled: false },
];

// ── Default notification rules ────────────────────────────────────────────────
const DEFAULT_RULES: NotificationRule[] = [
  {
    id: "ready_for_figma",
    trigger: "→ Ready for Figma",
    description: "Campaign is ready for design work",
    recipients: "division_designer + division_admin",
    enabled: true,
  },
  {
    id: "pending_review",
    trigger: "→ Pending Review",
    description: "Banners are ready for client review",
    recipients: "client_reviewer (for that client)",
    enabled: true,
  },
  {
    id: "all_approved",
    trigger: "→ All Approved",
    description: "All banners have been approved",
    recipients: "division_designer + division_admin",
    enabled: true,
  },
  {
    id: "revision_requested",
    trigger: "→ Revision Requested",
    description: "Client has requested revisions",
    recipients: "division_designer",
    enabled: true,
  },
];

// ── Main component ────────────────────────────────────────────────────────────
export default function PlatformSettingsTabs({
  initialTab,
  counts,
  config,
  integrations,
  email,
  formatsData,
  pluginVersion,
  pluginUpdated,
  appDomain,
}: Props) {
  const router = useRouter();
  const validTab = (TABS.find((t) => t.id === initialTab)?.id ?? "general") as TabId;
  const [activeTab, setActiveTab] = useState<TabId>(validTab);

  const setTab = (id: TabId) => {
    setActiveTab(id);
    router.replace(`/admin/settings?tab=${id}`, { scroll: false });
  };

  // ── Languages state ──────────────────────────────────────────────────────
  const [languages, setLanguages] = useState<Language[]>(() => {
    if (config.languages && Array.isArray(config.languages)) return config.languages;
    return DEFAULT_LANGUAGES;
  });
  const [langSaving, setLangSaving] = useState(false);
  const [langFlash, setLangFlash] = useState<string | null>(null);
  const [showAddLang, setShowAddLang] = useState(false);
  const [newLangCode, setNewLangCode] = useState("");
  const [newLangName, setNewLangName] = useState("");

  const saveLanguages = useCallback(async (langs: Language[]) => {
    setLangSaving(true);
    setLangFlash(null);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languages: langs }),
      });
      if (!res.ok) throw new Error("Save failed");
      setLangFlash("Saved");
    } catch {
      setLangFlash("Error saving");
    } finally {
      setLangSaving(false);
      setTimeout(() => setLangFlash(null), 2500);
    }
  }, []);

  const toggleLanguage = (code: string) => {
    const updated = languages.map((l) =>
      l.code === code && !l.isDefault ? { ...l, enabled: !l.enabled } : l
    );
    setLanguages(updated);
    saveLanguages(updated);
  };

  const addLanguage = () => {
    if (!newLangCode.trim() || !newLangName.trim()) return;
    const code = newLangCode.trim().toUpperCase().slice(0, 2);
    if (languages.find((l) => l.code === code)) return;
    const updated = [...languages, { code, name: newLangName.trim(), enabled: true }];
    setLanguages(updated);
    saveLanguages(updated);
    setNewLangCode("");
    setNewLangName("");
    setShowAddLang(false);
  };

  // ── Email notification rules state ───────────────────────────────────────
  const [rules, setRules] = useState<NotificationRule[]>(() => {
    if (config.emailNotificationRules && Array.isArray(config.emailNotificationRules)) {
      return config.emailNotificationRules;
    }
    return DEFAULT_RULES;
  });
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesFlash, setRulesFlash] = useState<string | null>(null);
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailFlash, setTestEmailFlash] = useState<string | null>(null);

  const toggleRule = async (id: string) => {
    const updated = rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    setRules(updated);
    setRulesSaving(true);
    setRulesFlash(null);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailNotificationRules: updated }),
      });
      if (!res.ok) throw new Error("Save failed");
      setRulesFlash("Saved");
    } catch {
      setRulesFlash("Error saving");
    } finally {
      setRulesSaving(false);
      setTimeout(() => setRulesFlash(null), 2500);
    }
  };

  const sendTestEmail = async () => {
    setTestEmailSending(true);
    setTestEmailFlash(null);
    try {
      const res = await fetch("/api/admin/platform-settings/test-email", { method: "POST" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed");
      }
      setTestEmailFlash("Test email sent — check your inbox");
    } catch (e: unknown) {
      setTestEmailFlash(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setTestEmailSending(false);
      setTimeout(() => setTestEmailFlash(null), 5000);
    }
  };

  // ── Branding state ───────────────────────────────────────────────────────
  const [brandingName, setBrandingName] = useState<string>(
    config.branding?.platformName ?? "Mente"
  );
  const [brandingTagline, setBrandingTagline] = useState<string>(
    config.branding?.tagline ?? "Banner Production Platform"
  );
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingFlash, setBrandingFlash] = useState<string | null>(null);

  const saveBranding = async () => {
    setBrandingSaving(true);
    setBrandingFlash(null);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branding: { platformName: brandingName, tagline: brandingTagline },
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setBrandingFlash("Saved");
    } catch {
      setBrandingFlash("Error saving");
    } finally {
      setBrandingSaving(false);
      setTimeout(() => setBrandingFlash(null), 2500);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6" aria-label="Platform settings tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id as TabId)}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── General tab ───────────────────────────────────────────────────── */}
      {activeTab === "general" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
              Platform Status
            </h2>
            <dl className="grid grid-cols-1 gap-y-3 sm:grid-cols-2">
              <Row label="Platform name" value="Mente" />
              <Row label="Domain" value={appDomain} />
              <Row label="Region" value="Stockholm (ARN1)" />
              <Row label="Active clients" value={String(counts.activeClients)} />
              <Row label="Total campaigns" value={String(counts.totalCampaigns)} />
              <Row label="Total banners" value={String(counts.totalBanners)} />
              <Row label="Total users" value={String(counts.activeUsers)} />
              <Row label="Vercel project" value="division-banner-factory" />
              <Row label="GitHub repo" value="urmaslilleorg/Division-Banner-Factory" />
            </dl>
          </div>
        </div>
      )}

      {/* ── Formats tab ───────────────────────────────────────────────────── */}
      {activeTab === "formats" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Master Formats</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              The master format library. Click any row to edit inline.
            </p>
          </div>
          <AdminFormatManager initialFormats={formatsData} />
        </div>
      )}

      {/* ── Languages tab ─────────────────────────────────────────────────── */}
      {activeTab === "languages" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Available Languages
              </h2>
              {langSaving && <span className="text-xs text-gray-400">Saving…</span>}
              {langFlash && !langSaving && (
                <span
                  className={`text-xs ${langFlash.startsWith("Error") ? "text-red-500" : "text-green-600"}`}
                >
                  {langFlash}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mb-4">
              These languages are available when creating clients and campaigns.
            </p>
            <ul className="space-y-2">
              {languages.map((lang) => (
                <li key={lang.code} className="flex items-center gap-3">
                  <button
                    onClick={() => toggleLanguage(lang.code)}
                    disabled={!!lang.isDefault}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                      lang.enabled ? "bg-gray-900" : "bg-gray-200"
                    } ${lang.isDefault ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                        lang.enabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span className="w-8 text-xs font-mono font-semibold text-gray-700">
                    {lang.code}
                  </span>
                  <span className="text-sm text-gray-700">{lang.name}</span>
                  {lang.isDefault && (
                    <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                      default
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {/* Add language */}
            {showAddLang ? (
              <div className="mt-4 flex items-end gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Code (2 chars)</label>
                  <input
                    value={newLangCode}
                    onChange={(e) => setNewLangCode(e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="DE"
                    maxLength={2}
                    className="w-16 rounded border border-gray-300 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Full name</label>
                  <input
                    value={newLangName}
                    onChange={(e) => setNewLangName(e.target.value)}
                    placeholder="German"
                    className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
                <button
                  onClick={addLanguage}
                  className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700"
                >
                  Add
                </button>
                <button
                  onClick={() => setShowAddLang(false)}
                  className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddLang(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-colors"
              >
                <span className="text-base leading-none">+</span> Add language
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Integrations tab ──────────────────────────────────────────────── */}
      {activeTab === "integrations" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
              Integrations
            </h2>
            <ul className="divide-y divide-gray-100">
              <IntegrationRow
                name="Airtable"
                description="Database backbone"
                connected={integrations.airtable}
              />
              <IntegrationRow
                name="Vercel Blob"
                description="Image storage (Stockholm CDN)"
                connected={integrations.vercelBlob}
              />
              <IntegrationRow
                name="Figma"
                description="Design tool integration"
                connected={integrations.figma}
              />
              <IntegrationRow
                name="Resend"
                description="Email notifications"
                connected={integrations.resend}
              />
              <IntegrationRow
                name="Anthropic (AI)"
                description="Video/banner analysis"
                connected={integrations.anthropic}
              />
              <IntegrationRow
                name="Clerk"
                description="Replaced by built-in auth"
                connected={false}
                removedVersion="v56.1"
              />
            </ul>
          </div>
        </div>
      )}

      {/* ── Email tab ─────────────────────────────────────────────────────── */}
      {activeTab === "email" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-6">
            {/* From address */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                Email Notifications
              </h2>
              <div className="space-y-1">
                <p className="text-sm text-gray-500">From address</p>
                <p className="text-sm font-mono text-gray-900 bg-gray-50 rounded px-3 py-2 border border-gray-200">
                  {email.fromAddress ?? "Not configured (set RESEND_FROM_EMAIL)"}
                </p>
                <p className="text-xs text-gray-400">
                  Set via <code className="bg-gray-100 px-1 rounded">RESEND_FROM_EMAIL</code> env
                  var. Requires domain verification in Resend.
                </p>
              </div>
              {email.fromAddress && !email.fromAddress.includes("onboarding@resend.dev") && (
                <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded px-3 py-2 border border-amber-100">
                  <span>⚠</span>
                  <span>
                    <strong>{email.fromAddress.split("@")[1]}</strong> — domain may not be
                    verified. Emails may send from{" "}
                    <code className="text-xs">onboarding@resend.dev</code> until verified.
                  </span>
                </div>
              )}
            </div>

            {/* Notification rules */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Notification Rules
                </h3>
                {rulesSaving && <span className="text-xs text-gray-400">Saving…</span>}
                {rulesFlash && !rulesSaving && (
                  <span
                    className={`text-xs ${rulesFlash.startsWith("Error") ? "text-red-500" : "text-green-600"}`}
                  >
                    {rulesFlash}
                  </span>
                )}
              </div>
              <ul className="space-y-3">
                {rules.map((rule) => (
                  <li
                    key={rule.id}
                    className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                  >
                    <button
                      onClick={() => toggleRule(rule.id)}
                      className={`mt-0.5 relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none cursor-pointer ${
                        rule.enabled ? "bg-gray-900" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                          rule.enabled ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{rule.trigger}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{rule.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Notify: {rule.recipients}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Test email */}
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={sendTestEmail}
                disabled={testEmailSending || !integrations.resend}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {testEmailSending ? "Sending…" : "Send test email to myself"}
              </button>
              {!integrations.resend && (
                <p className="mt-1.5 text-xs text-gray-400">
                  Requires <code className="bg-gray-100 px-1 rounded">RESEND_API_KEY</code> to be
                  configured.
                </p>
              )}
              {testEmailFlash && (
                <p
                  className={`mt-2 text-sm ${testEmailFlash.startsWith("Error") ? "text-red-600" : "text-green-600"}`}
                >
                  {testEmailFlash}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Branding tab ──────────────────────────────────────────────────── */}
      {activeTab === "branding" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-6">
            {/* Platform branding */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Platform Branding
                </h2>
                {brandingSaving && <span className="text-xs text-gray-400">Saving…</span>}
                {brandingFlash && !brandingSaving && (
                  <span
                    className={`text-xs ${brandingFlash.startsWith("Error") ? "text-red-500" : "text-green-600"}`}
                  >
                    {brandingFlash}
                  </span>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Platform name
                  </label>
                  <input
                    value={brandingName}
                    onChange={(e) => setBrandingName(e.target.value)}
                    className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Landing page tagline
                  </label>
                  <input
                    value={brandingTagline}
                    onChange={(e) => setBrandingTagline(e.target.value)}
                    className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
                <button
                  onClick={saveBranding}
                  disabled={brandingSaving}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  Save branding
                </button>
              </div>
            </div>

            {/* Figma plugin */}
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                Figma Plugin
              </h3>
              <div className="space-y-1 mb-4">
                <p className="text-sm text-gray-700">
                  <span className="text-gray-500">Current version:</span>{" "}
                  <span className="font-mono font-semibold">{pluginVersion}</span>
                </p>
                <p className="text-sm text-gray-700">
                  <span className="text-gray-500">Last updated:</span> {pluginUpdated}
                </p>
              </div>
              <a
                href="/api/plugin/download"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
              >
                <span>⬇</span> Download plugin ZIP
              </a>
              <div className="mt-4 rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 text-xs text-gray-500 space-y-1">
                <p className="font-medium text-gray-700">Distribution</p>
                <p>Share this ZIP with designers.</p>
                <p>
                  Install: Figma Desktop → Plugins → Development → Import plugin from manifest
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper sub-components ─────────────────────────────────────────────────────
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4">
      <dt className="w-40 shrink-0 text-sm text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function IntegrationRow({
  name,
  description,
  connected,
  removedVersion,
}: {
  name: string;
  description: string;
  connected: boolean;
  removedVersion?: string;
}) {
  return (
    <li className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-gray-900">{name}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <div className="shrink-0">
        {removedVersion ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500">
            ❌ Removed ({removedVersion})
          </span>
        ) : connected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
            ✅ Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
            ❌ Not configured
          </span>
        )}
      </div>
    </li>
  );
}
