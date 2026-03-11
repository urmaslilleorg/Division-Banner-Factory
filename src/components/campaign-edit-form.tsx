"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Campaign, AirtableFormat } from "@/lib/airtable-campaigns";
import type { VariableDefinition } from "@/components/variables-manager";
import type { ClientVariable } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft } from "lucide-react";

// ── Month helpers ──────────────────────────────────────────────────────────────
function convertToInputMonth(label: string): string {
  if (!label) return "";
  const months: Record<string, string> = {
    January: "01", February: "02", March: "03", April: "04",
    May: "05", June: "06", July: "07", August: "08",
    September: "09", October: "10", November: "11", December: "12",
  };
  const [month, year] = label.split(" ");
  return `${year}-${months[month] || "01"}`;
}

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

function parseLaunchMonthToYearMonth(label: string): { year: number; month: number } | null {
  if (!label) return null;
  const months: Record<string, number> = {
    January: 1, February: 2, March: 3, April: 4,
    May: 5, June: 6, July: 7, August: 8,
    September: 9, October: 10, November: 11, December: 12,
  };
  const [monthName, yearStr] = label.split(" ");
  const month = months[monthName];
  const year = parseInt(yearStr, 10);
  if (!month || isNaN(year)) return null;
  return { year, month };
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface CampaignEditFormProps {
  campaign: Campaign;
  formats: AirtableFormat[];
  variableRegistry?: VariableDefinition[];
  clientVariables?: ClientVariable[];
}

const LANGUAGE_OPTIONS = [
  { value: "ET", label: "ET" },
  { value: "EN", label: "EN" },
];

const FALLBACK_VARIABLE_OPTIONS = [
  { value: "H1", label: "H1" },
  { value: "H2", label: "H2" },
  { value: "H3", label: "H3" },
  { value: "CTA", label: "CTA" },
  { value: "Price_Tag", label: "Price Tag" },
  { value: "Illustration", label: "Illustration" },
];

export default function CampaignEditForm({
  campaign,
  formats,
  variableRegistry,
  clientVariables,
}: CampaignEditFormProps) {
  const router = useRouter();

  // Build variable options with per-client labels
  const baseOptions =
    variableRegistry && variableRegistry.length > 0
      ? variableRegistry.map((v) => ({ value: v.id, label: v.label }))
      : FALLBACK_VARIABLE_OPTIONS;

  const variableOptions =
    clientVariables && clientVariables.length > 0
      ? baseOptions
          .filter((opt) => clientVariables.some((cv) => cv.slot === opt.value))
          .map((opt) => {
            const cv = clientVariables.find((cv) => cv.slot === opt.value);
            return { value: opt.value, label: cv ? cv.label : opt.label };
          })
      : baseOptions;

  // Pre-fill from existing campaign record
  const [campaignName, setCampaignName] = useState(campaign.name);
  const [productName, setProductName] = useState(campaign.productName || "");
  const [launchMonth, setLaunchMonth] = useState(campaign.launchMonth || "");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(
    campaign.fieldConfig?.languages ?? ["ET"]
  );

  // Format IDs pre-selected from Field_Config.formats (array of format names → match by name)
  const formatNameSet = new Set(campaign.fieldConfig?.formats ?? []);
  const initialSelectedFormats = formats
    .filter((f) => formatNameSet.has(f.formatName))
    .map((f) => f.id);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(initialSelectedFormats);

  // Channel accordion state — expand channels that have pre-selected formats
  const preExpandedChannels = new Set(
    formats
      .filter((f) => initialSelectedFormats.includes(f.id))
      .map((f) => f.channel || "Other")
  );
  const [expandedChannels, setExpandedChannels] = useState<Record<string, boolean>>(
    Object.fromEntries(Array.from(preExpandedChannels).map((ch) => [ch, true]))
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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

  // Group formats by channel
  const formatsByChannel = formats.reduce<Record<string, AirtableFormat[]>>((acc, f) => {
    const ch = f.channel || "Other";
    if (!acc[ch]) acc[ch] = [];
    acc[ch].push(f);
    return acc;
  }, {});
  const sortedChannels = Object.keys(formatsByChannel).sort();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignName.trim()) { setError("Campaign name is required."); return; }
    if (!launchMonth) { setError("Launch month is required."); return; }
    if (selectedLanguages.length === 0) { setError("Select at least one language."); return; }

    setIsSubmitting(true);
    setError(null);

    // Build updated Field_Config — preserve existing format-level config, just update the list
    const selectedFormatNames = formats
      .filter((f) => selectedFormats.includes(f.id))
      .map((f) => f.formatName);

    const updatedFieldConfig = {
      ...(campaign.fieldConfig ?? {}),
      languages: selectedLanguages,
      formats: selectedFormatNames,
      variables: campaign.fieldConfig?.variables ?? variableOptions.map((v) => v.value),
    };

    const patchBody: Record<string, unknown> = {
      "Campaign Name": campaignName.trim(),
      Product_Name: productName.trim(),
      Launch_Month: launchMonth,
      Field_Config: JSON.stringify(updatedFieldConfig),
    };

    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update campaign");
      }

      setFlash("Campaign updated successfully");

      // Redirect to the month view for the (new) launch month
      const parsed = parseLaunchMonthToYearMonth(launchMonth);
      const destination = parsed ? `/${parsed.year}/${parsed.month}` : "/campaigns";
      setTimeout(() => router.push(destination), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    const parsed = parseLaunchMonthToYearMonth(campaign.launchMonth);
    if (parsed) {
      router.push(`/${parsed.year}/${parsed.month}`);
    } else {
      router.push("/campaigns");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={handleBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to calendar
      </button>

      {/* Flash */}
      {flash && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {flash}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Campaign Name */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">
          Campaign Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      {/* Product Name */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">Product Name</label>
        <input
          type="text"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="e.g. HydraBoost"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
        <p className="text-xs text-gray-400">Used in banner file naming. No spaces — use CamelCase.</p>
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

      {/* Languages */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Languages</label>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((lang) => (
            <button
              key={lang.value}
              type="button"
              onClick={() => toggleLanguage(lang.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selectedLanguages.includes(lang.value)
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 text-gray-600 hover:border-gray-400"
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* Formats */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Formats
          <span className="ml-2 text-xs font-normal text-gray-400">
            {selectedFormats.length} selected
          </span>
        </label>
        <p className="text-xs text-gray-400">
          Note: changing formats here updates the campaign record only. Existing banner records are not affected.
        </p>
        <div className="space-y-2 rounded-lg border border-gray-200 p-3">
          {sortedChannels.map((channel) => {
            const channelFormats = formatsByChannel[channel];
            const isExpanded = expandedChannels[channel] ?? false;
            const selectedInChannel = channelFormats.filter((f) =>
              selectedFormats.includes(f.id)
            ).length;
            return (
              <div key={channel} className="border-b border-gray-100 last:border-0 pb-2 last:pb-0">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedChannels((prev) => ({ ...prev, [channel]: !prev[channel] }))
                  }
                  className="flex w-full items-center justify-between py-1.5 text-left text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  <span>{channel}</span>
                  <span className="text-xs text-gray-400">
                    {selectedInChannel > 0 && (
                      <span className="mr-2 text-gray-700">{selectedInChannel} selected</span>
                    )}
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </button>
                {isExpanded && (
                  <div className="mt-1 space-y-1 pl-2">
                    {channelFormats.map((f) => (
                      <label
                        key={f.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedFormats.includes(f.id)}
                          onChange={() => toggleFormat(f.id)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
                        />
                        <span className="text-gray-700">{f.formatName}</span>
                        <span className="text-xs text-gray-400">
                          {f.widthPx}×{f.heightPx}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="min-w-[120px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
        <button
          type="button"
          onClick={handleBack}
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
