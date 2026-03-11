"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { Banner } from "@/lib/types";

interface Props {
  campaignId: string;
  campaignName: string;
}

export function DownloadZipButton({ campaignId, campaignName }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch approved banners for this campaign
      const bannersRes = await fetch(
        `/api/banners?campaignId=${encodeURIComponent(campaignId)}&approvalStatus=Approved`
      );
      if (!bannersRes.ok) throw new Error("Failed to fetch banners");
      const bannersData = await bannersRes.json();
      const banners: Banner[] = bannersData.banners ?? [];

      if (banners.length === 0) {
        throw new Error("No approved banners found");
      }

      // 2. Build the payload — use imageUrl (Product_Image_URL) as the download source
      const payload = banners
        .filter((b) => b.imageUrl)
        .map((b) => ({
          url: b.imageUrl,
          filename: `${b.bannerName || b.id}.png`,
        }));

      if (payload.length === 0) {
        throw new Error("No banners with image URLs — upload images first");
      }

      // 3. POST to download-zip
      const zipRes = await fetch("/api/banners/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banners: payload }),
      });

      if (!zipRes.ok) throw new Error("ZIP generation failed");

      // 4. Trigger browser download
      const blob = await zipRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${campaignName.replace(/\s+/g, "_")}_banners.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleDownload}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download className="h-3.5 w-3.5" />
        {loading ? "Preparing…" : "Download ZIP"}
      </button>
      {error && <p className="text-xs text-red-500 max-w-[160px] text-right">{error}</p>}
    </div>
  );
}
