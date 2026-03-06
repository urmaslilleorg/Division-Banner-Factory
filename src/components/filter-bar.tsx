"use client";

import { BannerStatus, Channel, Device } from "@/lib/types";

export interface FilterState {
  channel: string;
  device: string;
  language: string;
  status: string;
}

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  /** Only show languages from client config */
  availableLanguages: string[];
  /** Counts for summary display */
  totalCount: number;
  filteredCount: number;
}

const allChannels: Channel[] = [
  "Delfi",
  "Postimees",
  "Google",
  "Õhtuleht",
  "SmartAD",
  "Neti.ee",
  "Youtube",
  "Facebook/Instagram",
  "Web",
  "DOOH",
  "Email",
];

const allDevices: Device[] = [
  "Desktop",
  "Mobile",
  "Desktop+Mobile",
  "Tablet",
  "DOOH",
];

const allStatuses: BannerStatus[] = [
  "Draft",
  "Ready",
  "Client_Review",
  "Approved",
  "Exported",
  "Archived",
];

export default function FilterBar({
  filters,
  onFilterChange,
  availableLanguages,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  const update = (key: keyof FilterState, value: string) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const hasActiveFilters =
    filters.channel || filters.device || filters.language || filters.status;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Channel filter */}
        <select
          value={filters.channel}
          onChange={(e) => update("channel", e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
        >
          <option value="">All channels</option>
          {allChannels.map((ch) => (
            <option key={ch} value={ch}>
              {ch}
            </option>
          ))}
        </select>

        {/* Device filter */}
        <select
          value={filters.device}
          onChange={(e) => update("device", e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
        >
          <option value="">All devices</option>
          {allDevices.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {/* Language filter — only shows client's configured languages */}
        <select
          value={filters.language}
          onChange={(e) => update("language", e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
        >
          <option value="">All languages</option>
          {availableLanguages.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={filters.status}
          onChange={(e) => update("status", e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
        >
          <option value="">All statuses</option>
          {allStatuses.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={() =>
              onFilterChange({
                channel: "",
                device: "",
                language: "",
                status: "",
              })
            }
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Result count */}
      <p className="text-xs text-gray-400">
        {filteredCount === totalCount
          ? `${totalCount} banners`
          : `${filteredCount} of ${totalCount} banners`}
      </p>
    </div>
  );
}
