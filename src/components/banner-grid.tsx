"use client";

import { useState, useMemo } from "react";
import { Banner } from "@/lib/types";
import BannerCard from "./banner-card";
import FilterBar, { FilterState } from "./filter-bar";

interface BannerGridProps {
  banners: Banner[];
  availableLanguages: string[];
}

export default function BannerGrid({
  banners,
  availableLanguages,
}: BannerGridProps) {
  const [filters, setFilters] = useState<FilterState>({
    channel: "",
    device: "",
    language: "",
    status: "",
  });

  const filteredBanners = useMemo(() => {
    return banners.filter((b) => {
      if (filters.channel && b.channel !== filters.channel) return false;
      if (filters.device && b.device !== filters.device) return false;
      if (filters.language && b.language !== filters.language) return false;
      if (filters.status && b.status !== filters.status) return false;
      return true;
    });
  }, [banners, filters]);

  const handleBannerClick = (banner: Banner) => {
    // Phase 3 will add the preview modal here
    console.log("Banner clicked:", banner.id, banner.format);
  };

  return (
    <div className="space-y-6">
      <FilterBar
        filters={filters}
        onFilterChange={setFilters}
        availableLanguages={availableLanguages}
        totalCount={banners.length}
        filteredCount={filteredBanners.length}
      />

      {filteredBanners.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center text-sm text-gray-400">
          {banners.length === 0
            ? "No banners found for this campaign."
            : "No banners match the current filters."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredBanners.map((banner) => (
            <BannerCard
              key={banner.id}
              banner={banner}
              onClick={handleBannerClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
