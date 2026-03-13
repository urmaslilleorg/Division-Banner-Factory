"use client";

import { useState, useMemo, useCallback } from "react";
import { Banner } from "@/lib/types";
import BannerCard from "./banner-card";
import FilterBar, { FilterState } from "./filter-bar";
import BannerDetailModal from "./banner-detail-modal";
import CampaignSummaryBar, { QuickFilter } from "./campaign-summary-bar";
import { driveToDirectUrl } from "@/lib/drive";

interface BannerGridProps {
  banners: Banner[];
  userRole?: string;
}

// ─── Carousel Card ───────────────────────────────────────────────────────────

interface CarouselCardProps {
  parent: Banner;
  slides: Banner[];
  onClick: (banner: Banner) => void;
}

function CarouselCard({ parent, slides, onClick }: CarouselCardProps) {
  const [dotIndex, setDotIndex] = useState(0);

  const total = slides.length;
  const approvedCount = slides.filter(
    (s) => s.approvalStatus === "Approved"
  ).length;

  // Aggregate approval badge
  const allApproved = total > 0 && approvedCount === total;
  const noneApproved = approvedCount === 0;

  const aggregateBadgeClass = allApproved
    ? "bg-green-100 text-green-700"
    : noneApproved
    ? "bg-gray-100 text-gray-600"
    : "bg-blue-100 text-blue-700";

  const aggregateLabel =
    total === 0
      ? "0 slides"
      : `${approvedCount}/${total} approved`;

  // Thumbnail: show current dot slide's image or parent image
  const currentSlide = slides[dotIndex];
  const thumbnailUrl = currentSlide?.imageUrl
    ? driveToDirectUrl(currentSlide.imageUrl)
    : parent.imageUrl
    ? driveToDirectUrl(parent.imageUrl)
    : "";

  const aspectRatio =
    parent.width && parent.height ? parent.width / parent.height : 1;
  const isWide = aspectRatio > 2;
  const isTall = aspectRatio < 0.5;

  return (
    <div
      className="group cursor-pointer rounded-lg border border-gray-200 bg-white transition-all hover:border-violet-300 hover:shadow-sm min-h-64 flex flex-col"
      onClick={() => onClick(parent)}
    >
      {/* Thumbnail area */}
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-t-lg bg-gray-50 ${
          isWide ? "h-24" : isTall ? "h-64" : "h-40"
        }`}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`Carousel slide ${dotIndex + 1}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-300">
            <svg
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
              />
            </svg>
            <span className="text-xs">No preview</span>
          </div>
        )}

        {/* Dot indicators — top-left, stop propagation so clicking dots doesn't open modal */}
        {total > 0 && (
          <div
            className="absolute left-2 top-2 flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setDotIndex(i);
                }}
                className={`rounded-full transition-all ${
                  i === dotIndex
                    ? "h-2.5 w-2.5 bg-white shadow"
                    : "h-2 w-2 bg-white/60 hover:bg-white/90"
                }`}
                aria-label={`Preview slide ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* Format dimensions overlay */}
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {parent.width}×{parent.height}
        </span>
      </div>

      {/* Card body */}
      <div className="space-y-2 p-3">
        {/* Format name + slide count */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">
            {parent.format}
            {total > 0 && (
              <span className="ml-1 text-xs font-normal text-gray-400">
                ({total} slides)
              </span>
            )}
          </span>
          <span className="text-xs text-gray-400">#{parent.bannerId}</span>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5">
          {/* Language badge */}
          {parent.language && (
            <span className="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              {parent.language}
            </span>
          )}

          {/* Aggregate approval badge */}
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${aggregateBadgeClass}`}
          >
            {aggregateLabel}
          </span>

          {/* Channel badge */}
          {parent.channel && (
            <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
              {parent.channel}
            </span>
          )}

          {/* Carousel type badge */}
          <span className="inline-flex items-center gap-0.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
            ▤ Carousel
          </span>
        </div>

        {/* Banner name */}
        {parent.bannerName && (
          <p
            className="truncate font-mono text-[10px] text-gray-400"
            title={parent.bannerName}
          >
            {parent.bannerName}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Banner Grid ─────────────────────────────────────────────────────────────

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

  // Separate slides from displayable banners; Preview tab shows only banners with images
  const { displayBanners, slidesByParentId } = useMemo(() => {
    const slides = banners.filter((b) => b.bannerType === "Slide");

    const byParent: Record<string, Banner[]> = {};
    for (const slide of slides) {
      const parentId = slide.parentBannerIds?.[0];
      if (parentId) {
        if (!byParent[parentId]) byParent[parentId] = [];
        byParent[parentId].push(slide);
      }
    }
    // Sort slides by slideIndex
    for (const key of Object.keys(byParent)) {
      byParent[key].sort((a, b) => (a.slideIndex ?? 0) - (b.slideIndex ?? 0));
    }

    // Only show banners that have an image (Standard) or have at least one slide with an image (Carousel)
    const display = banners.filter((b) => {
      if (b.bannerType === "Slide") return false;
      if (b.bannerType === "Carousel") {
        return (byParent[b.id] ?? []).some((s) => !!s.imageUrl);
      }
      return !!b.imageUrl;
    });

    return { displayBanners: display, slidesByParentId: byParent };
  }, [banners]);

  // Apply quick filter + dropdown filters to displayable banners
  const filteredBanners = useMemo(() => {
    let result = displayBanners;

    if (quickFilter === "pending") {
      result = result.filter((b) => {
        if (b.bannerType === "Carousel") {
          const slides = slidesByParentId[b.id] ?? [];
          return slides.some(
            (s) => !s.approvalStatus || s.approvalStatus === "Pending"
          );
        }
        return !b.approvalStatus || b.approvalStatus === "Pending";
      });
    } else if (quickFilter === "revision") {
      result = result.filter((b) => {
        if (b.bannerType === "Carousel") {
          const slides = slidesByParentId[b.id] ?? [];
          return slides.some((s) => s.approvalStatus === "Revision_Requested");
        }
        return b.approvalStatus === "Revision_Requested";
      });
    }

    return result.filter((b) => {
      if (filters.channel && b.channel !== filters.channel) return false;
      if (filters.device && b.device !== filters.device) return false;
      if (filters.language && b.language !== filters.language) return false;
      if (filters.status && b.status !== filters.status) return false;
      return true;
    });
  }, [displayBanners, slidesByParentId, filters, quickFilter]);

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

  // Also allow updating a slide record (for per-slide approval)
  const handleSlideUpdate = useCallback((updatedSlide: Banner) => {
    setBanners((prev) =>
      prev.map((b) => (b.id === updatedSlide.id ? updatedSlide : b))
    );
  }, []);

  // Slides for the currently selected carousel (passed to modal)
  const selectedSlides = useMemo(() => {
    if (!selectedBanner || selectedBanner.bannerType !== "Carousel") return [];
    return slidesByParentId[selectedBanner.id] ?? [];
  }, [selectedBanner, slidesByParentId]);

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
        banners={displayBanners}
        totalCount={displayBanners.length}
        filteredCount={filteredBanners.length}
      />

      {filteredBanners.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          {displayBanners.length === 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-500">No banners ready for preview yet.</p>
              <p className="text-xs text-gray-400">Upload banner images from Figma to see them here.</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No banners match the current filters.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredBanners.map((banner) => (
            <div key={banner.id} className="flex flex-col">
              {banner.bannerType === "Carousel" ? (
                <CarouselCard
                  parent={banner}
                  slides={slidesByParentId[banner.id] ?? []}
                  onClick={handleBannerClick}
                />
              ) : (
                <BannerCard banner={banner} onClick={handleBannerClick} />
              )}
              {/* Preview tab is read-only — Delete and Upload moved to Copy & Assets */}
            </div>
          ))}
        </div>
      )}

      <BannerDetailModal
        banner={selectedBanner}
        slides={selectedSlides}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onBannerUpdate={handleBannerUpdate}
        onSlideUpdate={handleSlideUpdate}
      />
    </div>
  );
}
