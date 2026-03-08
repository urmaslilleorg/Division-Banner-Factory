"use client";

import { useState, useCallback, useEffect } from "react";
import { Banner } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  X,
  Download,
  MessageSquare,
  Send,
  Loader2,
} from "lucide-react";

interface BannerDetailModalProps {
  banner: Banner | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBannerUpdate: (updated: Banner) => void;
}

export default function BannerDetailModal({
  banner,
  open,
  onOpenChange,
  onBannerUpdate,
}: BannerDetailModalProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [revisionComment, setRevisionComment] = useState("");
  const [newComment, setNewComment] = useState("");
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "slides">("preview");
  const [slides, setSlides] = useState<Banner[]>([]);
  const [loadingSlides, setLoadingSlides] = useState(false);

  // Fetch slides when a Carousel banner is opened
  useEffect(() => {
    if (!banner || banner.bannerType !== "Carousel" || !open) return;
    setActiveTab("preview");
    setLoadingSlides(true);
    fetch(`/api/banners?parentId=${banner.id}`)
      .then((r) => r.json())
      .then((data) => setSlides(Array.isArray(data.banners) ? data.banners : []))
      .catch(() => setSlides([]))
      .finally(() => setLoadingSlides(false));
  }, [banner?.id, banner?.bannerType, open]);

  const handleDownload = useCallback(() => {
    if (banner?.imageUrl) {
      const link = document.createElement("a");
      link.href = banner.imageUrl;
      link.download = `${banner.figmaFrame || banner.format}_${banner.language || "banner"}.${banner.outputFormat?.toLowerCase() || "png"}`;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [banner]);

  if (!banner) return null;

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const res = await fetch(`/api/banners/${banner.id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      });
      if (res.ok) {
        onBannerUpdate({
          ...banner,
          approvalStatus: "Approved",
          clientApproved: true,
        });
      }
    } catch (error) {
      console.error("Failed to approve banner:", error);
    } finally {
      setIsApproving(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!revisionComment.trim()) return;
    setIsRequesting(true);
    try {
      const res = await fetch(`/api/banners/${banner.id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved: false,
          comment: revisionComment.trim(),
        }),
      });
      if (res.ok) {
        onBannerUpdate({
          ...banner,
          approvalStatus: "Revision_Requested",
          comment: revisionComment.trim(),
        });
        setRevisionComment("");
        setShowRevisionInput(false);
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Failed to request revision:", error);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
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

  // Status badge variant
  const approvalBadgeVariant = (() => {
    switch (banner.approvalStatus) {
      case "Approved":
        return "success" as const;
      case "Revision_Requested":
        return "warning" as const;
      default:
        return "secondary" as const;
    }
  })();

  // Language copy based on banner language
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        {/* Tab bar — only shown for Carousel banners */}
        {banner.bannerType === "Carousel" && (
          <div className="flex gap-1 border-b border-gray-100 pb-0 -mb-2">
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                activeTab === "preview"
                  ? "border border-b-white border-gray-200 bg-white text-gray-900 -mb-px"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveTab("slides")}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                activeTab === "slides"
                  ? "border border-b-white border-gray-200 bg-white text-gray-900 -mb-px"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Slides {slides.length > 0 && `(${slides.length})`}
            </button>
          </div>
        )}

        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-light">
              Banner #{banner.bannerId} — {banner.format}
            </span>
            <Badge variant={approvalBadgeVariant}>
              {(banner.approvalStatus || "Pending").replace(/_/g, " ")}
            </Badge>
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

        {/* Slides tab content */}
        {activeTab === "slides" && (
          <div className="min-h-48">
            {loadingSlides ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading slides...
              </div>
            ) : slides.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No slides found for this carousel.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {slides.map((slide) => (
                  <div key={slide.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                    <div className="flex items-center justify-center rounded bg-gray-100 h-28 overflow-hidden">
                      {slide.imageUrl ? (
                        <img src={slide.imageUrl} alt={`Slide ${slide.slideIndex}`} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <span className="text-xs text-gray-400">No preview</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-center text-xs font-medium text-gray-600">
                      Slide {slide.slideIndex}
                    </p>
                    <p className="text-center text-[10px] text-gray-400">{slide.figmaFrame}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Banner image preview */}
        {activeTab === "preview" && (
        <div className="relative overflow-auto rounded-lg border border-gray-100 bg-gray-50">
          {banner.imageUrl ? (
            <img
              src={banner.imageUrl}
              alt={`Banner ${banner.bannerId}`}
              className="mx-auto block"
              style={{
                maxWidth: "100%",
                maxHeight: "60vh",
              }}
            />
          ) : (
            <div
              className="mx-auto flex items-center justify-center bg-gray-100 text-gray-400 text-sm"
              style={{
                width: Math.min(banner.width, 800),
                height: Math.min(banner.height, 400),
                aspectRatio: `${banner.width}/${banner.height}`,
                maxWidth: "100%",
              }}
            >
              <div className="text-center">
                <p className="text-lg font-light">{banner.format}</p>
                <p className="text-xs mt-1">
                  {banner.width}×{banner.height}px
                </p>
                <p className="text-xs mt-2 text-gray-300">
                  No preview available
                </p>
              </div>
            </div>
          )}
        </div>
        )}

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

        {/* Approval action bar — visible to client_reviewer role */}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
          {banner.approvalStatus !== "Approved" && (
            <>
              <Button
                variant="success"
                size="sm"
                onClick={handleApprove}
                disabled={isApproving}
              >
                {isApproving ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Check className="mr-1 h-3 w-3" />
                )}
                Approve
              </Button>

              <Button
                variant="warning"
                size="sm"
                onClick={() => setShowRevisionInput(!showRevisionInput)}
                disabled={isRequesting}
              >
                <X className="mr-1 h-3 w-3" />
                Request revision
              </Button>
            </>
          )}

          {banner.approvalStatus === "Approved" && (
            <Badge variant="success" className="text-sm py-1 px-3">
              <Check className="mr-1 h-3 w-3" /> Approved
            </Badge>
          )}

          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="mr-1 h-3 w-3" />
            Download
          </Button>
        </div>

        {/* Revision comment input */}
        {showRevisionInput && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Textarea
              placeholder="Describe the revision needed..."
              value={revisionComment}
              onChange={(e) => setRevisionComment(e.target.value)}
              className="bg-white"
              rows={3}
            />
            <div className="flex gap-2">
              <Button
                variant="warning"
                size="sm"
                onClick={handleRequestRevision}
                disabled={isRequesting || !revisionComment.trim()}
              >
                {isRequesting ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Send className="mr-1 h-3 w-3" />
                )}
                Submit revision request
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowRevisionInput(false);
                  setRevisionComment("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Comment thread */}
        {/* TODO: consider separate Comments table in future phase */}
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
      </DialogContent>
    </Dialog>
  );
}
