"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { Campaign, BannerSummary } from "@/lib/airtable-campaigns";
import { Progress } from "@/components/ui/progress";
import CampaignStatusBadge from "@/components/campaign-status-badge";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface CalendarGridProps {
  campaigns: Campaign[];
  bannerSummaries: BannerSummary[];
  userRole: string;
}

interface MonthData {
  month: string; // e.g. "March"
  year: number;
  campaigns: Campaign[];
  totalBanners: number;
  approvedBanners: number;
  revisionBanners: number;
  pendingBanners: number;
  readyToExport: number;
  toBrief: number;
  avgCopyProgress: number;
}

function parseMonthYear(launchMonth: string): { month: string; year: number } | null {
  if (!launchMonth) return null;
  const parts = launchMonth.trim().split(" ");
  if (parts.length !== 2) return null;
  const year = parseInt(parts[1], 10);
  if (isNaN(year)) return null;
  return { month: parts[0], year };
}

export default function CalendarGrid({
  campaigns,
  bannerSummaries,
  userRole,
}: CalendarGridProps) {
  const currentYear = new Date().getFullYear();

  // Determine available years
  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    for (const c of campaigns) {
      const parsed = parseMonthYear(c.launchMonth);
      if (parsed) years.add(parsed.year);
    }
    return Array.from(years).sort();
  }, [campaigns, currentYear]);

  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Build banner lookup: campaignName → summaries
  const bannersByCampaign = useMemo(() => {
    const map = new Map<string, BannerSummary[]>();
    for (const b of bannerSummaries) {
      const key = b.campaignName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return map;
  }, [bannerSummaries]);

  // Build month data for selected year
  const monthData: MonthData[] = useMemo(() => {
    return MONTHS.map((month) => {
      const monthCampaigns = campaigns.filter((c) => {
        const parsed = parseMonthYear(c.launchMonth);
        return parsed?.month === month && parsed?.year === selectedYear;
      });

      let totalBanners = 0;
      let approvedBanners = 0;
      let revisionBanners = 0;
      let pendingBanners = 0;
      let readyToExport = 0;
      let toBrief = 0;

      for (const c of monthCampaigns) {
        const banners = bannersByCampaign.get(c.name) || [];
        totalBanners += banners.length;
        approvedBanners += banners.filter((b) => b.approvalStatus === "Approved").length;
        revisionBanners += banners.filter((b) => b.approvalStatus === "Revision_Requested").length;
        pendingBanners += banners.filter(
          (b) => !b.approvalStatus || b.approvalStatus === "Pending"
        ).length;
        readyToExport += banners.filter((b) => b.status === "Approved").length;
        toBrief += banners.filter((b) => b.status === "Brief_received").length;
      }

      const avgCopyProgress =
        monthCampaigns.length > 0
          ? Math.round(
              monthCampaigns.reduce((sum, c) => sum + (c.copyProgress || 0), 0) /
                monthCampaigns.length
            )
          : 0;
      return {
        month,
        year: selectedYear,
        campaigns: monthCampaigns,
        totalBanners,
        approvedBanners,
        revisionBanners,
        pendingBanners,
        readyToExport,
        toBrief,
        avgCopyProgress,
      };
    });
  }, [campaigns, bannerSummaries, bannersByCampaign, selectedYear]);

  const canGoPrev = availableYears.indexOf(selectedYear) > 0;
  const canGoNext = availableYears.indexOf(selectedYear) < availableYears.length - 1;

  return (
    <div className="space-y-6">
      {/* Year selector */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => {
            const idx = availableYears.indexOf(selectedYear);
            if (idx > 0) setSelectedYear(availableYears[idx - 1]);
          }}
          disabled={!canGoPrev}
          className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-2xl font-light tracking-wide">{selectedYear}</span>
        <button
          onClick={() => {
            const idx = availableYears.indexOf(selectedYear);
            if (idx < availableYears.length - 1) setSelectedYear(availableYears[idx + 1]);
          }}
          disabled={!canGoNext}
          className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* 3×4 month grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {monthData.map((data) => {
          const hasActivity = data.campaigns.length > 0;
          const progress =
            data.totalBanners > 0
              ? Math.round((data.approvedBanners / data.totalBanners) * 100)
              : 0;
          const allApproved =
            data.totalBanners > 0 && data.approvedBanners === data.totalBanners;
          const monthSlug = data.month.toLowerCase();
          const href = `/${selectedYear}/${monthSlug}`;

          return (
            <Link
              key={data.month}
              href={href}
              className={`group block rounded-xl border p-4 transition-all hover:shadow-md min-h-52 ${
                hasActivity
                  ? "border-gray-200 bg-white hover:border-gray-300"
                  : "border-gray-100 bg-gray-50 opacity-50 hover:opacity-70"
              }`}
            >
              {/* Month header */}
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-medium text-gray-900">{data.month}</h3>
                {allApproved && hasActivity && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
              </div>

              {!hasActivity ? (
                <p className="text-xs text-gray-400">No activity</p>
              ) : (
                <div className="space-y-3">
                  {/* Campaign count */}
                  <p className="text-xs text-gray-500">
                    {data.campaigns.length === 1
                      ? "1 campaign"
                      : `${data.campaigns.length} campaigns`}
                  </p>

                  {/* Approval progress */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>
                        {data.approvedBanners} of {data.totalBanners} approved
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-1" />
                  </div>
                  {/* Copy progress */}
                  {data.avgCopyProgress > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>Copy</span>
                        <span>{data.avgCopyProgress}%</span>
                      </div>
                      <Progress value={data.avgCopyProgress} className="h-1 [&>div]:bg-violet-400" />
                    </div>
                  )}

                  {/* Urgent task badge */}
                  <UrgentBadge data={data} role={userRole} />

                  {/* Campaign names */}
                  <CampaignNames campaigns={data.campaigns} />
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function UrgentBadge({ data, role }: { data: MonthData; role: string }) {
  if (role === "division_admin" || role === "division_designer") {
    if (data.revisionBanners > 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          {data.revisionBanners} revision{data.revisionBanners > 1 ? "s" : ""} requested
        </span>
      );
    }
    if (role === "division_designer" && data.readyToExport > 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-800">
          {data.readyToExport} ready to export
        </span>
      );
    }
    if (role === "division_designer" && data.toBrief > 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
          {data.toBrief} to brief
        </span>
      );
    }
    if (data.pendingBanners > 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
          {data.pendingBanners} pending review
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
        All approved ✓
      </span>
    );
  }

  if (role === "client_reviewer") {
    const awaitingApproval = data.pendingBanners;
    if (awaitingApproval > 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
          {awaitingApproval} awaiting your approval
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
        All approved ✓
      </span>
    );
  }

  return null;
}

function CampaignNames({ campaigns }: { campaigns: Campaign[] }) {
  if (campaigns.length === 0) return null;
  const shown = campaigns.slice(0, 2);
  const extra = campaigns.length - 2;
  return (
    <div className="space-y-0.5">
      {shown.map((c) => (
        <div key={c.id} className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400 truncate">{c.name}</span>
          <CampaignStatusBadge status={c.campaignStatus} />
        </div>
      ))}
      {extra > 0 && (
        <p className="text-[10px] text-gray-400">+{extra} more</p>
      )}
    </div>
  );
}
