"use client";

import { Banner, ApprovalStatus, Language } from "@/lib/types";
import { driveToDirectUrl } from "@/lib/drive";

interface BannerCardProps {
  banner: Banner;
  onClick?: (banner: Banner) => void;
}

const languageColors: Record<Language, string> = {
  ET: "bg-blue-100 text-blue-700",
  EN: "bg-green-100 text-green-700",
  RU: "bg-red-100 text-red-700",
  LV: "bg-amber-100 text-amber-700",
  LT: "bg-purple-100 text-purple-700",
};

const statusColors: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-600",
  Ready: "bg-sky-100 text-sky-700",
  Client_Review: "bg-indigo-100 text-indigo-700",
  Approved: "bg-green-100 text-green-700",
  Exported: "bg-teal-100 text-teal-700",
  Archived: "bg-gray-100 text-gray-500",
};

const approvalColors: Record<ApprovalStatus, string> = {
  Pending: "bg-gray-100 text-gray-600",
  Approved: "bg-green-100 text-green-700",
  Revision_Requested: "bg-amber-100 text-amber-700",
};

const approvalLabels: Record<ApprovalStatus, string> = {
  Pending: "Pending",
  Approved: "Approved",
  Revision_Requested: "Revision",
};

export default function BannerCard({ banner, onClick }: BannerCardProps) {
  // Determine aspect ratio for thumbnail container
  const aspectRatio = banner.width && banner.height
    ? banner.width / banner.height
    : 1;

  // Constrain thumbnail to reasonable display size
  const isWide = aspectRatio > 2;
  const isTall = aspectRatio < 0.5;

  return (
    <div
      className="group cursor-pointer rounded-lg border border-gray-200 bg-white transition-all hover:border-gray-300 hover:shadow-sm min-h-64 flex flex-col"
      onClick={() => onClick?.(banner)}
    >
      {/* Thumbnail area */}
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-t-lg bg-gray-50 ${
          isWide ? "h-24" : isTall ? "h-64" : "h-40"
        }`}
      >
        {banner.imageUrl ? (
          <img
            src={driveToDirectUrl(banner.imageUrl)}
            alt={`Banner ${banner.bannerId}`}
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

        {/* Format dimensions overlay */}
        <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {banner.width}×{banner.height}
        </span>
      </div>

      {/* Card body */}
      <div className="space-y-2 p-3">
        {/* Format name */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900">
            {banner.format}
          </span>
          <span className="text-xs text-gray-400">#{banner.bannerId}</span>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5">
          {/* Language badge */}
          {banner.language && (
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                languageColors[banner.language] || "bg-gray-100 text-gray-600"
              }`}
            >
              {banner.language}
            </span>
          )}

          {/* Status badge */}
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
              statusColors[banner.status] || "bg-gray-100 text-gray-600"
            }`}
          >
            {banner.status.replace("_", " ")}
          </span>

          {/* Approval badge (only if set) */}
          {banner.approvalStatus && (
            <span
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                approvalColors[banner.approvalStatus]
              }`}
            >
              {approvalLabels[banner.approvalStatus]}
            </span>
          )}

          {/* Channel badge (if set) */}
          {banner.channel && (
            <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
              {banner.channel}
            </span>
          )}

          {/* Carousel badge */}
          {banner.bannerType === "Carousel" && (
            <span className="inline-flex items-center gap-0.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
              ▤ Carousel
            </span>
          )}
        </div>

        {/* Banner name — monospace identifier */}
        {banner.bannerName && (
          <p className="truncate font-mono text-[10px] text-gray-400" title={banner.bannerName}>
            {banner.bannerName}
          </p>
        )}

        {/* Copy preview — show H1 in appropriate language */}
        {(banner.h1ET || banner.h1EN || banner.h1) && (
          <p className="truncate text-xs text-gray-500">
            {banner.h1ET || banner.h1EN || banner.h1}
          </p>
        )}
      </div>
    </div>
  );
}
