"use client";

import { Banner } from "@/lib/types";

export interface FilterState {
  channel: string;
  device: string;
  language: string;
  status: string;
}

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  /** The actual banner records — dropdown options are derived from these */
  banners: Banner[];
  /** Counts for summary display */
  totalCount: number;
  filteredCount: number;
}

export default function FilterBar({
  filters,
  onFilterChange,
  banners,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  // Derive dropdown options from the actual records
  const channels = Array.from(
    new Set(banners.map((b) => b.channel).filter((v): v is NonNullable<typeof v> => !!v))
  ).sort();
  const devices = Array.from(
    new Set(banners.map((b) => b.device).filter((v): v is NonNullable<typeof v> => !!v))
  ).sort();
  const languages = Array.from(
    new Set(banners.map((b) => b.language).filter((v): v is NonNullable<typeof v> => !!v))
  ).sort();
  const statuses = Array.from(
    new Set(banners.map((b) => b.status).filter((v): v is NonNullable<typeof v> => !!v))
  ).sort();

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
          <option value="">All channels ({channels.length})</option>
          {channels.map((ch) => (
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
          <option value="">All devices ({devices.length})</option>
          {devices.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {/* Language filter */}
        <select
          value={filters.language}
          onChange={(e) => update("language", e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
        >
          <option value="">All languages ({languages.length})</option>
          {languages.map((lang) => (
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
          <option value="">All statuses ({statuses.length})</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
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
