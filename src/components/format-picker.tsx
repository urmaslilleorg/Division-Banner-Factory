"use client";

import { useState, useEffect } from "react";
import type { AirtableFormat } from "@/lib/airtable-campaigns";

export interface FormatPickerProps {
  formats: AirtableFormat[];
  selected: string[];
  onChange: (selected: string[]) => void;
  showCount?: boolean;
}

const CHANNEL_ORDER = [
  "Facebook/Instagram",
  "Google",
  "Web",
  "DOOH",
  "Email",
  "Delfi",
  "Neti.ee",
  "Postimees",
  "Ohtuleht",
  "SmartAD",
  "Youtube",
  "Programmatic (RTB)",
];

function groupByChannel(
  formats: AirtableFormat[]
): Record<string, AirtableFormat[]> {
  const groups: Record<string, AirtableFormat[]> = {};
  for (const f of formats) {
    const ch = f.channel || "Other";
    if (!groups[ch]) groups[ch] = [];
    groups[ch].push(f);
  }
  return groups;
}

function orderedChannels(groups: Record<string, AirtableFormat[]>): string[] {
  const known = CHANNEL_ORDER.filter((ch) => groups[ch]);
  const extra = Object.keys(groups)
    .filter((ch) => !CHANNEL_ORDER.includes(ch))
    .sort();
  return [...known, ...extra];
}

export default function FormatPicker({
  formats,
  selected,
  onChange,
  showCount = true,
}: FormatPickerProps) {
  const grouped = groupByChannel(formats);
  const channels = orderedChannels(grouped);

  // Nexd template id → name map (fetched once on mount)
  const [nexdTemplatesMap, setNexdTemplatesMap] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/nexd/templates")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.templates) return;
        const map: Record<string, string> = {};
        for (const t of data.templates) map[t.id] = t.name;
        setNexdTemplatesMap(map);
      })
      .catch(() => {});
  }, []);

  // All channels collapsed by default
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleChannel = (ch: string) =>
    setExpanded((prev) => ({ ...prev, [ch]: !prev[ch] }));

  const toggleFormat = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const selectAllInChannel = (channelFormats: AirtableFormat[]) => {
    const ids = channelFormats.map((f) => f.id);
    const allSelected = ids.every((id) => selected.includes(id));
    if (allSelected) {
      onChange(selected.filter((s) => !ids.includes(s)));
    } else {
      const newSelected = [...selected];
      for (const id of ids) {
        if (!newSelected.includes(id)) newSelected.push(id);
      }
      onChange(newSelected);
    }
  };

  return (
    <div className="space-y-1">
      {showCount && (
        <p className="text-xs text-gray-400 mb-2">
          {selected.length} format{selected.length !== 1 ? "s" : ""} selected
        </p>
      )}

      {channels.map((ch) => {
        const channelFormats = grouped[ch];
        const isOpen = !!expanded[ch];
        const selectedInChannel = channelFormats.filter((f) =>
          selected.includes(f.id)
        ).length;
        const allSelected = selectedInChannel === channelFormats.length;

        return (
          <div
            key={ch}
            className="rounded-lg border border-gray-200 overflow-hidden"
          >
            {/* Channel header */}
            <div className="flex items-center bg-gray-50 border-b border-gray-200">
              <button
                type="button"
                onClick={() => toggleChannel(ch)}
                className="flex flex-1 items-center gap-2 px-4 py-2.5 text-left"
              >
                {/* Chevron */}
                <svg
                  className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200 ${
                    isOpen ? "rotate-90" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>

                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                  {ch}
                </span>

                <span className="text-xs text-gray-400">
                  {selectedInChannel > 0
                    ? `(${selectedInChannel}/${channelFormats.length} selected)`
                    : `(${channelFormats.length} formats)`}
                </span>
              </button>

              {/* Select / Deselect all */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  selectAllInChannel(channelFormats);
                }}
                className="shrink-0 px-4 py-2.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            </div>

            {/* Format rows — animated expand/collapse */}
            <div
              style={{
                maxHeight: isOpen ? `${channelFormats.length * 44}px` : "0px",
                overflow: "hidden",
                transition: "max-height 0.2s ease",
              }}
            >
              <div className="divide-y divide-gray-100">
                {channelFormats.map((f) => (
                  <label
                    key={f.id}
                    className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(f.id)}
                      onChange={() => toggleFormat(f.id)}
                      className="h-4 w-4 rounded border-gray-300 text-gray-900 shrink-0"
                    />
                    <span className="flex-1 text-sm text-gray-700 truncate">
                      {f.formatName}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {f.widthPx}×{f.heightPx}
                    </span>
                    {f.device && (
                      <span className="text-xs text-gray-400 shrink-0 w-24 text-right">
                        {f.device}
                      </span>
                    )}
                    {f.nexdTemplateIds.length > 0 && (
                      <span className="text-xs font-medium text-emerald-600 shrink-0">
                        {f.nexdTemplateIds.map((id) => nexdTemplatesMap[id] ?? id).join(", ")}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
