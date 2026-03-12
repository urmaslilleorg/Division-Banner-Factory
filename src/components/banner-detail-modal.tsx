"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  ChevronDown,
  Upload,
} from "lucide-react";
import { driveToDirectUrl } from "@/lib/drive";

interface BannerDetailModalProps {
  banner: Banner | null;
  /** Pre-fetched slides for Carousel banners (sorted by slideIndex) */
  slides?: Banner[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBannerUpdate: (updated: Banner) => void;
  /** Called when a slide record is updated (approval, upload, comment) */
  onSlideUpdate?: (updated: Banner) => void;
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

function ApprovalDropdown({
  bannerId,
  currentStatus,
  onStatusChange,
}: ApprovalDropdownProps) {
  const [status, setStatus] = useState<ApprovalStatus>(currentStatus);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setStatus(currentStatus);
  }, [currentStatus]);

  const handleChange = async (newStatus: ApprovalStatus) => {
    setStatus(newStatus);
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
        } ${
          status === "Approved"
            ? "focus:ring-green-400"
            : status === "Revision_Requested"
            ? "focus:ring-amber-400"
            : "focus:ring-gray-400"
        }`}
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

// ─── Slide Upload Button ──────────────────────────────────────────────────────

interface SlideUploadButtonProps {
  slideId: string;
  onUploadSuccess: (imageUrl: string) => void;
}

function SlideUploadButton({ slideId, onUploadSuccess }: SlideUploadButtonProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setMessage("Only PNG and JPG files are accepted.");
      return;
    }
    setIsUploading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bannerId", slideId);
      const res = await fetch(`/api/banners/${slideId}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
      const data = await res.json();
      const newUrl = data.imageUrl || data.url || "";
      setMessage("Uploaded ✓");
      setTimeout(() => setMessage(null), 3000);
      onUploadSuccess(newUrl);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={handleFileChange}
        className="hidden"
        id={`slide-upload-${slideId}`}
      />
      <label htmlFor={`slide-upload-${slideId}`}>
        <Button
          size="sm"
          variant="outline"
          disabled={isUploading}
          className="text-xs cursor-pointer"
          asChild
        >
          <span>
            {isUploading ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3 w-3" />
            )}
            Upload image for this slide
          </span>
        </Button>
      </label>
      {message && <span className="text-xs text-gray-500">{message}</span>}
    </div>
  );
}

// ─── Carousel Modal Content ───────────────────────────────────────────────────

interface CarouselModalContentProps {
  parent: Banner;
  slides: Banner[];
  onSlideUpdate: (updated: Banner) => void;
}

function CarouselModalContent({
  parent,
  slides,
  onSlideUpdate,
}: CarouselModalContentProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [slideComments, setSlideComments] = useState<Record<string, string>>({});
  const [sendingComment, setSendingComment] = useState<string | null>(null);

  const total = slides.length;
  const current = slides[currentIndex];

  const approvedCount = slides.filter(
    (s) => s.approvalStatus === "Approved"
  ).length;

  const prev = () => setCurrentIndex((i) => (i - 1 + total) % total);
  const next = () => setCurrentIndex((i) => (i + 1) % total);

  const handleSlideApproval = (slideId: string, newStatus: ApprovalStatus) => {
    const slide = slides.find((s) => s.id === slideId);
    if (!slide) return;
    onSlideUpdate({
      ...slide,
      approvalStatus: newStatus,
      clientApproved: newStatus === "Approved",
    });
  };

  const handleSlideImageUpload = (slideId: string, imageUrl: string) => {
    const slide = slides.find((s) => s.id === slideId);
    if (!slide) return;
    onSlideUpdate({ ...slide, imageUrl });
  };

  const handleSlideDownload = (slide: Banner) => {
    if (!slide.imageUrl) return;
    const link = document.createElement("a");
    link.href = driveToDirectUrl(slide.imageUrl);
    link.download = `${parent.figmaFrame || parent.format}_slide${slide.slideIndex || currentIndex + 1}.${parent.outputFormat?.toLowerCase() || "png"}`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddSlideComment = async (slide: Banner) => {
    const text = slideComments[slide.id]?.trim();
    if (!text) return;
    setSendingComment(slide.id);
    try {
      const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const formatted = `[Client] [${timestamp}]: ${text}`;
      const updated = slide.comment ? `${slide.comment}\n${formatted}` : formatted;
      const res = await fetch(`/api/banners/${slide.id}/comment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: updated }),
      });
      if (res.ok) {
        onSlideUpdate({ ...slide, comment: updated });
        setSlideComments((prev) => ({ ...prev, [slide.id]: "" }));
      }
    } catch {
      // silent
    } finally {
      setSendingComment(null);
    }
  };

  if (total === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No slides yet — add copy in the Copy Editor.
      </p>
    );
  }

  const thumbnailUrl = current?.imageUrl
    ? driveToDirectUrl(current.imageUrl)
    : "";

  // Copy fields for current slide
  const slideCopy = current
    ? current.language === "EN"
      ? {
          h1: current.h1EN || current.h1,
          h2: current.h2EN || current.h2,
          h3: current.h3EN || current.h3,
          cta: current.ctaEN,
        }
      : {
          h1: current.h1ET || current.h1,
          h2: current.h2ET || current.h2,
          h3: current.h3ET || current.h3,
          cta: current.ctaET,
        }
    : null;

  return (
    <div className="space-y-4">
      {/* Aggregate header */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          {parent.format} — {total} slides
        </span>
        <span
          className={`font-medium ${
            approvedCount === total
              ? "text-green-600"
              : approvedCount === 0
              ? "text-gray-400"
              : "text-blue-600"
          }`}
        >
          {approvedCount}/{total} approved
        </span>
      </div>

      {/* Slide image */}
      <div
        className="mx-auto flex items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-gray-50"
        style={{
          width: "100%",
          aspectRatio: `${parent.width}/${parent.height}`,
          maxHeight: "40vh",
        }}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`Slide ${currentIndex + 1}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="text-center text-gray-400">
            <p className="text-sm font-light">{parent.format}</p>
            <p className="text-xs mt-1">
              {parent.width}×{parent.height}px — No image yet
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={prev}
          className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
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
          className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Next slide"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <p className="text-center text-xs text-gray-400">
        Slide {currentIndex + 1} of {total}
      </p>

      {/* Copy fields for this slide */}
      {slideCopy && (slideCopy.h1 || slideCopy.h2 || slideCopy.h3 || slideCopy.cta) && (
        <div className="rounded-lg bg-gray-50 p-3 space-y-0.5 text-xs text-gray-700">
          {slideCopy.h1 && (
            <p>
              <span className="text-gray-400 mr-1">H1:</span>
              {slideCopy.h1}
            </p>
          )}
          {slideCopy.h2 && (
            <p>
              <span className="text-gray-400 mr-1">H2:</span>
              {slideCopy.h2}
            </p>
          )}
          {slideCopy.h3 && (
            <p>
              <span className="text-gray-400 mr-1">H3:</span>
              {slideCopy.h3}
            </p>
          )}
          {slideCopy.cta && (
            <p>
              <span className="text-gray-400 mr-1">CTA:</span>
              {slideCopy.cta}
            </p>
          )}
        </div>
      )}

      {/* Per-slide action bar: Approval + Download */}
      {current && (
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <ApprovalDropdown
            bannerId={current.id}
            currentStatus={(current.approvalStatus as ApprovalStatus) ?? "Pending"}
            onStatusChange={(newStatus) =>
              handleSlideApproval(current.id, newStatus)
            }
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSlideDownload(current)}
            disabled={!current.imageUrl}
          >
            <Download className="mr-1 h-3 w-3" />
            Download
          </Button>
        </div>
      )}

      {/* Per-slide upload */}
      {current && (
        <div className="border-t border-gray-100 pt-4">
          <SlideUploadButton
            slideId={current.id}
            onUploadSuccess={(url) => handleSlideImageUpload(current.id, url)}
          />
        </div>
      )}

      {/* Per-slide comment */}
      {current && (
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <MessageSquare className="h-4 w-4" />
            <span>Comments — Slide {currentIndex + 1}</span>
          </div>
          {current.comment ? (
            <div className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
              {current.comment.split("\n").map((line, i) => (
                <p key={i} className="text-gray-700">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No comments yet.</p>
          )}
          <div className="flex gap-2">
            <Textarea
              placeholder="Add a comment for this slide..."
              value={slideComments[current.id] ?? ""}
              onChange={(e) =>
                setSlideComments((prev) => ({
                  ...prev,
                  [current.id]: e.target.value,
                }))
              }
              rows={2}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleAddSlideComment(current)}
              disabled={
                sendingComment === current.id ||
                !slideComments[current.id]?.trim()
              }
              className="self-end"
            >
              {sendingComment === current.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────────────

export default function BannerDetailModal({
  banner,
  slides = [],
  open,
  onOpenChange,
  onBannerUpdate,
  onSlideUpdate,
}: BannerDetailModalProps) {
  const [newComment, setNewComment] = useState("");
  const [isSendingComment, setIsSendingComment] = useState(false);

  // Reset comment input when banner changes
  useEffect(() => {
    setNewComment("");
  }, [banner?.id]);

  const handleDownload = useCallback(() => {
    if (banner?.imageUrl) {
      const link = document.createElement("a");
      link.href = driveToDirectUrl(banner.imageUrl);
      link.download = `${banner.figmaFrame || banner.format}_${
        banner.language || "banner"
      }.${banner.outputFormat?.toLowerCase() || "png"}`;
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

  const resolvedImageUrl = banner.imageUrl
    ? driveToDirectUrl(banner.imageUrl)
    : "";

  const isCarousel = banner.bannerType === "Carousel";

  // Aggregate approval for carousel header
  const carouselApproved = slides.filter(
    (s) => s.approvalStatus === "Approved"
  ).length;
  const carouselTotal = slides.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-light">
              {isCarousel
                ? `${banner.format} — ${carouselTotal} slides`
                : `Banner #${banner.bannerId} — ${banner.format}`}
            </span>
            {isCarousel && (
              <span className="inline-flex items-center gap-0.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                ▤ Carousel
              </span>
            )}
            {isCarousel && carouselTotal > 0 && (
              <span
                className={`text-sm font-normal ${
                  carouselApproved === carouselTotal
                    ? "text-green-600"
                    : carouselApproved === 0
                    ? "text-gray-400"
                    : "text-blue-600"
                }`}
              >
                {carouselApproved}/{carouselTotal} approved
              </span>
            )}
          </DialogTitle>
          {banner.bannerName && (
            <div className="flex items-center gap-2 pt-0.5">
              <span className="font-mono text-xs text-gray-500 break-all">
                {banner.bannerName}
              </span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(banner.bannerName)}
                className="shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Copy banner name"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </div>
          )}
          <DialogDescription>
            {banner.channel} · {banner.device} · {banner.language} ·{" "}
            {banner.width}×{banner.height}px · {banner.outputFormat}
          </DialogDescription>
        </DialogHeader>

        {/* ── Carousel: per-slide navigation ── */}
        {isCarousel && (
          <CarouselModalContent
            parent={banner}
            slides={slides}
            onSlideUpdate={(updated) => onSlideUpdate?.(updated)}
          />
        )}

        {/* ── Standard banner ── */}
        {!isCarousel && (
          <>
            {/* Image preview */}
            <div className="relative overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
              {resolvedImageUrl ? (
                <img
                  src={resolvedImageUrl}
                  alt={`Banner ${banner.bannerId}`}
                  className="mx-auto block"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "60vh",
                    objectFit: "contain",
                  }}
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

            {/* Metadata row */}
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">
                  Campaign
                </p>
                <p className="font-medium">{banner.campaignName}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider">
                  Figma Frame
                </p>
                <p className="font-mono text-xs break-all">{banner.figmaFrame}</p>
              </div>
              {banner.safeArea && (
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wider">
                    Safe Area
                  </p>
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
                      <p>
                        <span className="text-gray-400">H1:</span> {copyFields.h1}
                      </p>
                    )}
                    {copyFields.h2 && (
                      <p>
                        <span className="text-gray-400">H2:</span> {copyFields.h2}
                      </p>
                    )}
                    {copyFields.h3 && (
                      <p>
                        <span className="text-gray-400">H3:</span> {copyFields.h3}
                      </p>
                    )}
                    {copyFields.cta && (
                      <p>
                        <span className="text-gray-400">CTA:</span> {copyFields.cta}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Approval action bar */}
            <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
              <ApprovalDropdown
                bannerId={banner.id}
                currentStatus={
                  (banner.approvalStatus as ApprovalStatus) ?? "Pending"
                }
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
                    <p key={i} className="text-gray-700">
                      {line}
                    </p>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
