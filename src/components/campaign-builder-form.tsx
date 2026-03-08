"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AirtableFormat } from "@/lib/airtable-campaigns";
import { Button } from "@/components/ui/button";
import { Loader2, Copy, Check, ArrowLeft, Edit3 } from "lucide-react";

const CLIENT_OPTIONS = [
  { value: "avene", label: "Avene" },
  { value: "demo", label: "Demo" },
];

const VARIABLE_OPTIONS = [
  { value: "H1", label: "H1" },
  { value: "H2", label: "H2" },
  { value: "H3", label: "H3" },
  { value: "CTA", label: "CTA" },
  { value: "Price_Tag", label: "Price Tag" },
  { value: "Illustration", label: "Illustration" },
];

const LANGUAGE_OPTIONS = [
  { value: "ET", label: "ET" },
  { value: "EN", label: "EN" },
];

interface SuccessResult {
  campaignId: string;
  bannerCount: number;
  figmaFrames: string[];
}

interface CampaignBuilderFormProps {
  formats: AirtableFormat[];
}

export default function CampaignBuilderForm({ formats }: CampaignBuilderFormProps) {
  const router = useRouter();

  // Form state
  const [campaignName, setCampaignName] = useState("");
  const [clientName, setClientName] = useState("avene");
  const [launchMonth, setLaunchMonth] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["ET"]);
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [selectedVariables, setSelectedVariables] = useState<string[]>(["H1", "H2", "CTA"]);

  // Default copy fields
  const [defaultH1, setDefaultH1] = useState("");
  const [defaultH2, setDefaultH2] = useState("");
  const [defaultH3, setDefaultH3] = useState("");
  const [defaultCta, setDefaultCta] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SuccessResult | null>(null);
  const [copied, setCopied] = useState(false);

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

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const toggleFormat = (id: string) => {
    setSelectedFormats((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const toggleVariable = (v: string) => {
    setSelectedVariables((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignName.trim()) { setError("Campaign name is required."); return; }
    if (!launchMonth) { setError("Launch month is required."); return; }
    if (selectedLanguages.length === 0) { setError("Select at least one language."); return; }
    if (selectedFormats.length === 0) { setError("Select at least one format."); return; }

    setIsSubmitting(true);
    setError(null);

    const selectedFormatData = formats.filter((f) => selectedFormats.includes(f.id));

    try {
      const res = await fetch("/api/campaigns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName: campaignName.trim(),
          clientName,
          launchMonth,
          startDate,
          endDate,
          languages: selectedLanguages,
          defaultCopy: {
            h1: defaultH1.trim() || null,
            h2: defaultH2.trim() || null,
            h3: defaultH3.trim() || null,
            cta: defaultCta.trim() || null,
          },
          formats: selectedFormatData.map((f) => ({
            id: f.id,
            formatName: f.formatName,
            widthPx: f.widthPx,
            heightPx: f.heightPx,
            channel: f.channel,
            device: f.device,
            safeArea: f.safeArea,
            outputFormat: f.outputFormat,
          })),
          variables: selectedVariables,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create campaign");
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyAll = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.figmaFrames.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Success screen
  if (result) {
    return (
      <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-emerald-700">
            ✓ {result.bannerCount} banner records created
          </h2>
          <p className="text-sm text-gray-500">Campaign ID: {result.campaignId}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Figma Frames</p>
            <Button variant="outline" size="sm" onClick={handleCopyAll}>
              {copied ? (
                <><Check className="mr-1 h-3 w-3" /> Copied</>
              ) : (
                <><Copy className="mr-1 h-3 w-3" /> Copy all</>
              )}
            </Button>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-600 space-y-1 max-h-64 overflow-y-auto">
            {result.figmaFrames.map((frame, i) => (
              <p key={i}>{frame}</p>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="default"
            onClick={() => router.push(`/dashboard/campaigns/${result.campaignId}/copy`)}
          >
            <Edit3 className="mr-1 h-4 w-4" />
            Edit copy
          </Button>
          <Button variant="outline" onClick={() => router.push("/")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to calendar
          </Button>
        </div>
      </div>
    );
  }

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

      {/* Client */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">Client</label>
        <select
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        >
          {CLIENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
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

      {/* Active Variables */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Active Variables</label>
        <div className="flex flex-wrap gap-2">
          {VARIABLE_OPTIONS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => toggleVariable(v.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedVariables.includes(v.value)
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Default Copy Fields */}
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Default Copy (optional)</label>
          <p className="text-xs text-gray-400">Pre-fills all banner records. Edit per-banner in the Copy Editor after creation.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {selectedVariables.includes("H1") && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">H1</label>
              <input
                type="text"
                value={defaultH1}
                onChange={(e) => setDefaultH1(e.target.value)}
                placeholder="Headline 1"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          )}
          {selectedVariables.includes("H2") && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">H2</label>
              <input
                type="text"
                value={defaultH2}
                onChange={(e) => setDefaultH2(e.target.value)}
                placeholder="Headline 2"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          )}
          {selectedVariables.includes("H3") && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">H3</label>
              <input
                type="text"
                value={defaultH3}
                onChange={(e) => setDefaultH3(e.target.value)}
                placeholder="Headline 3"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          )}
          {selectedVariables.includes("CTA") && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600">CTA</label>
              <input
                type="text"
                value={defaultCta}
                onChange={(e) => setDefaultCta(e.target.value)}
                placeholder="Call to action"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          )}
        </div>
      </div>

      {/* Formats — grouped by channel */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Formats <span className="text-red-500">*</span>
          </label>
          <span className="text-xs text-gray-400">
            {selectedFormats.length} selected
          </span>
        </div>

        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
          {Object.entries(formatsByChannel).map(([channel, channelFormats]) => (
            <div key={channel} className="p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {channel}
              </p>
              <div className="space-y-1.5">
                {channelFormats.map((f) => (
                  <label
                    key={f.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFormats.includes(f.id)}
                      onChange={() => toggleFormat(f.id)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
                    />
                    <span className="text-sm text-gray-700">{f.formatName}</span>
                    <span className="ml-auto text-xs text-gray-400">
                      {f.widthPx}×{f.heightPx}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Creating…</>
          ) : (
            "Create campaign"
          )}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
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
