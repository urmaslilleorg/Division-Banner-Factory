"use client";

import { useState, useCallback, useEffect } from "react";
import { Banner, ApprovalStatus } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Download,
  MessageSquare,
  Send,
  Loader2,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Play,
  ChevronDown,
} from "lucide-react";
import { driveToDirectUrl } from "@/lib/drive";

interface BannerDetailModalProps {
  banner: Banner | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBannerUpdate: (updated: Banner) => void;
}

// ─── Carousel Slideshow ──────────────────────────────────────────────────────

interface CarouselSlideshowProps {
  slides: Banner[];
  parentBanner: Banner;
}

function CarouselSlideshow({ slides, parentBanner }: CarouselSlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"preview" | "overview">("preview");

  const total = slides.length;
  const current = slides[currentIndex];

  const prev = () => setCurrentIndex((i) => (i - 1 + total) % total);
  const next = () => setCurrentIndex((i) => (i + 1) % total);

  // Copy fields for a slide
  const slideCopy = (slide: Banner) =>
    slide.language === "EN"
      ? { h1: slide.h1EN || slide.h1, h2: slide.h2EN || slide.h2, h3: slide.h3EN || slide.h3, cta: slide.ctaEN }
      : { h1: slide.h1ET || slide.h1, h2: slide.h2ET || slide.h2, h3: slide.h3ET || slide.h3, cta: slide.ctaET };

  if (total === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No slides yet — add copy in the Copy Editor.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* View toggle */}
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={() => setViewMode("preview")}
          className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            viewMode === "preview"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Play className="h-3 w-3" />
          Preview
        </button>
        <button
          onClick={() => setViewMode("overview")}
          className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            viewMode === "overview"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <LayoutGrid className="h-3 w-3" />
          Overview
        </button>
      </div>

      {/* Preview mode — single slide slideshow */}
      {viewMode === "preview" && current && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          {/* Image */}
          <div
            className="mx-auto flex items-center justify-center overflow-hidden rounded bg-gray-100"
            style={{
              width: "100%",
              aspectRatio: `${parentBanner.width}/${parentBanner.height}`,
              maxHeight: "40vh",
            }}
          >
            {current.imageUrl ? (
              <img
                src={driveToDirectUrl(current.imageUrl)}
                alt={`Slide ${currentIndex + 1}`}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-xs text-gray-400">
                {parentBanner.width}×{parentBanner.height} — No image yet
              </span>
            )}
          </div>

          {/* Copy fields */}
          {(() => {
            const c = slideCopy(current);
            return (c.h1 || c.h2 || c.h3 || c.cta) ? (
              <div className="mt-3 space-y-0.5 text-xs text-gray-700">
                {c.h1 && <p><span className="text-gray-400 mr-1">H1:</span>{c.h1}</p>}
                {c.h2 && <p><span className="text-gray-400 mr-1">H2:</span>{c.h2}</p>}
                {c.h3 && <p><span className="text-gray-400 mr-1">H3:</span>{c.h3}</p>}
                {c.cta && <p><span className="text-gray-400 mr-1">CTA:</span>{c.cta}</p>}
              </div>
            ) : (
              <p className="mt-2 text-center text-xs text-gray-400">No copy yet</p>
            );
          })()}

          {/* Navigation */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={prev}
              className="rounded-full p-1.5 text-gray-500 hover:bg-gray-200 transition-colors"
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Dot indicators */}
            <div className="flex items-center gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`rounded-full transition-all ${
                    i === currentIndex
                      ? "h-2.5 w-2.5 bg-gray-800"
                      : "h-2 w-2 bg-gray-300 hover:bg-gray-400"
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>

            <button
              onClick={next}
              className="rounded-full p-1.5 text-gray-500 hover:bg-gray-200 transition-colors"
              aria-label="Next slide"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-center text-xs text-gray-400">
            Slide {currentIndex + 1} of {total}
          </p>
        </div>
      )}

      {/* Overview mode — horizontal strip of all slides */}
      {viewMode === "overview" && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {slides.map((slide, i) => {
            const c = slideCopy(slide);
            return (
              <button
                key={slide.id}
                onClick={() => {
                  setCurrentIndex(i);
                  setViewMode("preview");
                }}
                className={`shrink-0 w-36 rounded-lg border bg-gray-50 p-2 text-left transition-all hover:border-gray-400 ${
                  i === currentIndex ? "border-gray-800" : "border-gray-200"
                }`}
              >
                <div
                  className="flex items-center justify-center overflow-hidden rounded bg-gray-100"
                  style={{
                    width: "100%",
                    aspectRatio: `${parentBanner.width}/${parentBanner.height}`,
                    maxHeight: "80px",
                  }}
                >
                  {slide.imageUrl ? (
                    <img
                      src={driveToDirectUrl(slide.imageUrl)}
                      alt={`Slide ${i + 1}`}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-gray-400">No image</span>
                  )}
                </div>
                <p className="mt-1.5 text-center text-[10px] font-medium text-gray-600">
                  Slide {i + 1}
                </p>
                {c.h1 && (
                  <p className="truncate text-[10px] text-gray-400">{c.h1}</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Approval Status Dropdown ─────────────────────────────────────────────────

const APPROVAL_OPTIONS: { value: ApprovalStatus; label: string }[] = [
  { value: "Pending", label: "Pending" },
  { value: "Approved", label: "Approved" },
  { value: "Revision_Requested", label: "Revision Requested" },
];

const approvalDropdownStyles: Record<ApprovalStatus, string> = {
  Pending: "border-gray-300 text-gray-600 bg-white",
  Approved: "border-green-400 text-green-700 bg-green-50",
  Revision_Requested: "border-amber-400 text-amber-700 bg-amber-50",
};

interface ApprovalDropdownProps {
  bannerId: string;
  currentStatus: ApprovalStatus;
  onStatusChange: (newStatus: ApprovalStatus) => void;
}

function ApprovalDropdown({ bannerId, currentStatus, onStatusChange }: ApprovalDropdownProps) {
  const [status, setStatus] = useState<ApprovalStatus>(currentStatus);
  const [isSaving, setIsSaving] = useState(false);

  // Sync if parent banner changes (e.g. navigating between banners)
  useEffect(() => {
    setStatus(currentStatus);
  }, [currentStatus]);

  const handleChange = async (newStatus: ApprovalStatus) => {
    setStatus(newStatus); // optimistic
    setIsSaving(true);
    try {
      const res = await fetch(`/api/banners/${bannerId}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalStatus: newStatus }),
      });
      if (res.ok) {
        onStatusChange(newStatus);
      } else {
        // Revert on failure
        setStatus(currentStatus);
      }
    } catch {
      setStatus(currentStatus);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative flex items-center">
      <select
        value={status}
        onChange={(e) => handleChange(e.target.value as ApprovalStatus)}
        disabled={isSaving}
        className={`appearance-none rounded-md border py-1.5 pl-3 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 transition-colors cursor-pointer disabled:opacity-60 ${
          approvalDropdownStyles[status]
        } ${status === "Approved" ? "focus:ring-green-400" : status === "Revision_Requested" ? "focus:ring-amber-400" : "focus:ring-gray-400"}`}
      >
        {APPROVAL_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        {isSaving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        )}
      </div>
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────────────

export default function BannerDetailModal({
  banner,
  open,
  onOpenChange,
  onBannerUpdate,
}: BannerDetailModalProps) {
  const [newComment, setNewComment] = useState("");
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [slides, setSlides] = useState<Banner[]>([]);
  const [loadingSlides, setLoadingSlides] = useState(false);

  // Fetch slides when a Carousel banner is opened
  useEffect(() => {
    if (!banner || banner.bannerType !== "Carousel" || !open) return;
    setLoadingSlides(true);
    fetch(`/api/banners?parentId=${banner.id}`)
      .then((r) => r.json())
      .then((data) => setSlides(Array.isArray(data.banners) ? data.banners : []))
      .catch(() => setSlides([]))
      .finally(() => setLoadingSlides(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banner?.id, banner?.bannerType, open]);

  const handleDownload = useCallback(() => {
    if (banner?.imageUrl) {
      const link = document.createElement("a");
      link.href = driveToDirectUrl(banner.imageUrl);
      link.download = `${banner.figmaFrame || banner.format}_${banner.language || "banner"}.${banner.outputFormat?.toLowerCase() || "png"}`;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [banner]);

  const handleAddComment = async () => {
    if (!banner || !newComment.trim()) return;
    setIsSendingComment(true);
    try {
      const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const formattedComment = `[Client] [${timestamp}]: ${newComment.trim()}`;
      const updatedComment = banner.comment
        ? `${banner.comment}\n${formattedComment}`
        : formattedComment;

      const res = await fetch(`/api/banners/${banner.id}/comment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: updatedComment }),
      });
      if (res.ok) {
        onBannerUpdate({ ...banner, comment: updatedComment });
        setNewComment("");
      }
    } catch (error) {
      console.error("Failed to add comment:", error);
    } finally {
      setIsSendingComment(false);
    }
  };

  if (!banner) return null;

  const copyFields =
    banner.language === "EN"
      ? {
          h1: banner.h1EN || banner.h1,
          h2: banner.h2EN || banner.h2,
          h3: banner.h3EN || banner.h3,
          cta: banner.ctaEN,
        }
      : {
          h1: banner.h1ET || banner.h1,
          h2: banner.h2ET || banner.h2,
          h3: banner.h3ET || banner.h3,
          cta: banner.ctaET,
        };

  // Resolved image URL (Drive → direct)
  const resolvedImageUrl = banner.imageUrl ? driveToDirectUrl(banner.imageUrl) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-light">
              Banner #{banner.bannerId} — {banner.format}
            </span>
            {banner.bannerType === "Carousel" && (
              <span className="inline-flex items-center gap-0.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                ▤ Carousel
              </span>
            )}
          </DialogTitle>
          {banner.bannerName && (
            <div className="flex items-center gap-2 pt-0.5">
              <span className="font-mono text-xs text-gray-500 break-all">{banner.bannerName}</span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(banner.bannerName)}
                className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Copy banner name"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          )}
          <DialogDescription>
            {banner.channel} · {banner.device} · {banner.language} ·{" "}
            {banner.width}×{banner.height}px · {banner.outputFormat}
          </DialogDescription>
        </DialogHeader>

        {/* ── Carousel: slideshow / overview ── */}
        {banner.bannerType === "Carousel" && (
          <div className="min-h-48">
            {loadingSlides ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading slides...
              </div>
            ) : (
              <CarouselSlideshow slides={slides} parentBanner={banner} />
            )}
          </div>
        )}

        {/* ── Standard banner image preview ── */}
        {banner.bannerType !== "Carousel" && (
          <div className="relative overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
            {resolvedImageUrl ? (
              <img
                src={resolvedImageUrl}
                alt={`Banner ${banner.bannerId}`}
                className="mx-auto block"
                style={{ maxWidth: "100%", maxHeight: "60vh", objectFit: "contain" }}
              />
            ) : (
              <div
                className="mx-auto flex items-center justify-center bg-gray-100 text-gray-400 text-sm"
                style={{
                  width: "100%",
                  aspectRatio: `${banner.width}/${banner.height}`,
                  maxHeight: "50vh",
                }}
              >
                <div className="text-center">
                  <p className="text-base font-light">{banner.format}</p>
                  <p className="text-xs mt-1 text-gray-400">
                    {banner.width}×{banner.height}px — No image yet
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Metadata row */}
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wider">Campaign</p>
            <p className="font-medium">{banner.campaignName}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wider">Figma Frame</p>
            <p className="font-mono text-xs break-all">{banner.figmaFrame}</p>
          </div>
          {banner.safeArea && (
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider">Safe Area</p>
              <p className="font-medium">{banner.safeArea}</p>
            </div>
          )}
          {(copyFields.h1 || copyFields.h2 || copyFields.cta) && (
            <div className="col-span-2 md:col-span-4">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">
                Copy ({banner.language || "default"})
              </p>
              <div className="space-y-0.5 text-xs">
                {copyFields.h1 && (
                  <p><span className="text-gray-400">H1:</span> {copyFields.h1}</p>
                )}
                {copyFields.h2 && (
                  <p><span className="text-gray-400">H2:</span> {copyFields.h2}</p>
                )}
                {copyFields.h3 && (
                  <p><span className="text-gray-400">H3:</span> {copyFields.h3}</p>
                )}
                {copyFields.cta && (
                  <p><span className="text-gray-400">CTA:</span> {copyFields.cta}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Approval action bar: single dropdown + Download ── */}
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <ApprovalDropdown
            bannerId={banner.id}
            currentStatus={(banner.approvalStatus as ApprovalStatus) ?? "Pending"}
            onStatusChange={(newStatus) =>
              onBannerUpdate({
                ...banner,
                approvalStatus: newStatus,
                clientApproved: newStatus === "Approved",
              })
            }
          />
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="mr-1 h-3 w-3" />
            Download
          </Button>
        </div>

        {/* Comment thread */}
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <MessageSquare className="h-4 w-4" />
            <span>Comments</span>
          </div>
          {banner.comment ? (
            <div className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
              {banner.comment.split("\n").map((line, i) => (
                <p key={i} className="text-gray-700">{line}</p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No comments yet.</p>
          )}
          <div className="flex gap-2">
            <Textarea
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={2}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleAddComment}
              disabled={isSendingComment || !newComment.trim()}
              className="self-end"
            >
              {isSendingComment ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
