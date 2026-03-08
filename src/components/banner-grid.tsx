"use client";

import { useState, useMemo, useCallback } from "react";
import { Banner } from "@/lib/types";
import BannerCard from "./banner-card";
import FilterBar, { FilterState } from "./filter-bar";
import BannerDetailModal from "./banner-detail-modal";
import CampaignSummaryBar, { QuickFilter } from "./campaign-summary-bar";

interface BannerGridProps {
  banners: Banner[];
}

export default function BannerGrid({ banners: initialBanners }: BannerGridProps) {
  // Local state for optimistic updates
  const [banners, setBanners] = useState<Banner[]>(initialBanners);

  const [filters, setFilters] = useState<FilterState>({
    channel: "",
    device: "",
    language: "",
    status: "",
  });

  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [selectedBanner, setSelectedBanner] = useState<Banner | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Apply quick filter first, then dropdown filters
  const filteredBanners = useMemo(() => {
    let result = banners;

    // Quick filter
    if (quickFilter === "pending") {
      result = result.filter(
        (b) => !b.approvalStatus || b.approvalStatus === "Pending"
      );
    } else if (quickFilter === "revision") {
      result = result.filter(
        (b) => b.approvalStatus === "Revision_Requested"
      );
    }

    // Dropdown filters
    return result.filter((b) => {
      if (filters.channel && b.channel !== filters.channel) return false;
      if (filters.device && b.device !== filters.device) return false;
      if (filters.language && b.language !== filters.language) return false;
      if (filters.status && b.status !== filters.status) return false;
      return true;
    });
  }, [banners, filters, quickFilter]);

  const handleBannerClick = useCallback((banner: Banner) => {
    setSelectedBanner(banner);
    setModalOpen(true);
  }, []);

  const handleBannerUpdate = useCallback((updated: Banner) => {
    // Optimistic update — update both the list and the selected banner
    setBanners((prev) =>
      prev.map((b) => (b.id === updated.id ? updated : b))
    );
    setSelectedBanner(updated);
  }, []);

  return (
    <div className="space-y-6">
      {/* Campaign summary bar */}
      <CampaignSummaryBar
        banners={banners}
        activeQuickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
      />

      {/* Dropdown filters */}
      <FilterBar
        filters={filters}
        onFilterChange={setFilters}
        banners={banners}
        totalCount={banners.length}
        filteredCount={filteredBanners.length}
      />

      {/* Banner grid */}
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

      {/* Banner detail modal */}
      <BannerDetailModal
        banner={selectedBanner}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onBannerUpdate={handleBannerUpdate}
      />
    </div>
  );
}
