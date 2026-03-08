"use client";

import { useMemo, useState } from "react";
import { Banner } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package } from "lucide-react";

export type QuickFilter = "all" | "pending" | "revision";

interface CampaignSummaryBarProps {
  banners: Banner[];
  activeQuickFilter: QuickFilter;
  onQuickFilterChange: (filter: QuickFilter) => void;
}

export default function CampaignSummaryBar({
  banners,
  activeQuickFilter,
  onQuickFilterChange,
}: CampaignSummaryBarProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const stats = useMemo(() => {
    const total = banners.length;
    const approved = banners.filter(
      (b) => b.approvalStatus === "Approved"
    ).length;
    const pending = banners.filter(
      (b) => !b.approvalStatus || b.approvalStatus === "Pending"
    ).length;
    const revision = banners.filter(
      (b) => b.approvalStatus === "Revision_Requested"
    ).length;
    const progress = total > 0 ? Math.round((approved / total) * 100) : 0;
    return { total, approved, pending, revision, progress };
  }, [banners]);

  const handleDownloadApproved = async () => {
    const approvedBanners = banners.filter(
      (b) => b.approvalStatus === "Approved" && b.imageUrl
    );
    if (approvedBanners.length === 0) return;

    setIsDownloading(true);
    try {
      const res = await fetch("/api/banners/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          banners: approvedBanners.map((b) => ({
            url: b.imageUrl,
            filename: `${b.figmaFrame || b.format}_${b.language || "banner"}.${b.outputFormat?.toLowerCase() || "png"}`,
          })),
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `approved_banners_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Failed to download ZIP:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      {/* Progress row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-gray-700">
              {stats.approved} of {stats.total} banners approved
            </span>
            <span className="text-xs text-gray-400">{stats.progress}%</span>
          </div>
          <Progress value={stats.progress} />
        </div>

        <Button
          variant="default"
          size="sm"
          onClick={handleDownloadApproved}
          disabled={isDownloading || stats.approved === 0}
          className="shrink-0"
        >
          {isDownloading ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Package className="mr-1 h-3 w-3" />
          )}
          Download all approved
        </Button>
      </div>

      {/* Quick filter buttons */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 mr-1">Quick filter:</span>

        <button
          onClick={() => onQuickFilterChange("all")}
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            activeQuickFilter === "all"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All
          <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
            {stats.total}
          </Badge>
        </button>

        <button
          onClick={() => onQuickFilterChange("pending")}
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            activeQuickFilter === "pending"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Pending review
          <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
            {stats.pending}
          </Badge>
        </button>

        <button
          onClick={() => onQuickFilterChange("revision")}
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            activeQuickFilter === "revision"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Revision requested
          <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
            {stats.revision}
          </Badge>
        </button>
      </div>
    </div>
  );
}
