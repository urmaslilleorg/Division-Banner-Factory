"use client";

import { useState, useMemo, useCallback } from "react";
import { Banner } from "@/lib/types";
import BannerCard from "./banner-card";
import FilterBar, { FilterState } from "./filter-bar";
import BannerDetailModal from "./banner-detail-modal";
import CampaignSummaryBar, { QuickFilter } from "./campaign-summary-bar";
import DesignerControls from "./designer-controls";

interface BannerGridProps {
  banners: Banner[];
  userRole?: string;
}

export default function BannerGrid({
  banners: initialBanners,
  userRole = "client_reviewer",
}: BannerGridProps) {
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

  const isDesigner =
    userRole === "division_designer" || userRole === "division_admin";

  // Apply quick filter first, then dropdown filters
  const filteredBanners = useMemo(() => {
    let result = banners;

    if (quickFilter === "pending") {
      result = result.filter(
        (b) => !b.approvalStatus || b.approvalStatus === "Pending"
      );
    } else if (quickFilter === "revision") {
      result = result.filter(
        (b) => b.approvalStatus === "Revision_Requested"
      );
    }

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
    setBanners((prev) =>
      prev.map((b) => (b.id === updated.id ? updated : b))
    );
    setSelectedBanner(updated);
  }, []);

  // Optimistic delete: remove card from grid immediately
  const handleBannerDelete = useCallback((bannerId: string) => {
    setBanners((prev) => prev.filter((b) => b.id !== bannerId));
    // Close modal if the deleted banner was open
    setSelectedBanner((prev) => (prev?.id === bannerId ? null : prev));
    setModalOpen((open) => {
      if (open && selectedBanner?.id === bannerId) return false;
      return open;
    });
  }, [selectedBanner]);

  return (
    <div className="space-y-6">
      <CampaignSummaryBar
        banners={banners}
        activeQuickFilter={quickFilter}
        onQuickFilterChange={setQuickFilter}
      />

      <FilterBar
        filters={filters}
        onFilterChange={setFilters}
        banners={banners}
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
            <div key={banner.id} className="flex flex-col">
              <BannerCard banner={banner} onClick={handleBannerClick} />
              {isDesigner && (
                <DesignerControls
                  bannerId={banner.id}
                  onDelete={handleBannerDelete}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <BannerDetailModal
        banner={selectedBanner}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onBannerUpdate={handleBannerUpdate}
      />
    </div>
  );
}
