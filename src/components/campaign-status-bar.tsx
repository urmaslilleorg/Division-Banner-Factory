"use client";

import { useState } from "react";

export type CampaignStatus =
  | "Draft"
  | "Copy_In_Progress"
  | "Ready_For_Figma"
  | "In_Design"
  | "Pending_Review"
  | "Approved"
  | "Delivered";

const STATUS_CONFIG: Record<
  CampaignStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  Draft: {
    label: "Draft",
    bg: "bg-gray-100",
    text: "text-gray-600",
    dot: "bg-gray-400",
  },
  Copy_In_Progress: {
    label: "Copy in progress",
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  Ready_For_Figma: {
    label: "Ready for Figma",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  In_Design: {
    label: "In design",
    bg: "bg-purple-50",
    text: "text-purple-700",
    dot: "bg-purple-500",
  },
  Pending_Review: {
    label: "Pending review",
    bg: "bg-orange-50",
    text: "text-orange-700",
    dot: "bg-orange-500",
  },
  Approved: {
    label: "Approved",
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
  },
  Delivered: {
    label: "Delivered",
    bg: "bg-gray-200",
    text: "text-gray-700",
    dot: "bg-gray-500",
  },
};

const ALL_STATUSES: CampaignStatus[] = [
  "Draft",
  "Copy_In_Progress",
  "Ready_For_Figma",
  "In_Design",
  "Pending_Review",
  "Approved",
  "Delivered",
];

interface Props {
  campaignId: string;
  initialStatus: CampaignStatus;
  userRole: string;
}

export default function CampaignStatusBar({
  campaignId,
  initialStatus,
  userRole,
}: Props) {
  const [status, setStatus] = useState<CampaignStatus>(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notified, setNotified] = useState<string[] | null>(null);

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.Draft;

  async function changeStatus(newStatus: CampaignStatus) {
    if (newStatus === status) return;
    setSaving(true);
    setError(null);
    setNotified(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      setStatus(newStatus);
      if (data.notified?.length > 0) {
        setNotified(data.notified);
        setTimeout(() => setNotified(null), 5000);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  // Determine what action button(s) to show
  const actionButton = (() => {
    if (userRole === "client_reviewer" && status === "Copy_In_Progress") {
      return (
        <button
          onClick={() => changeStatus("Ready_For_Figma")}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Updating…" : "Mark ready for Figma →"}
        </button>
      );
    }
    if (userRole === "division_designer" && status === "Ready_For_Figma") {
      return (
        <button
          onClick={() => changeStatus("In_Design")}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Updating…" : "Mark as in design"}
        </button>
      );
    }
    if (userRole === "division_admin") {
      return (
        <select
          value={status}
          onChange={(e) => changeStatus(e.target.value as CampaignStatus)}
          disabled={saving}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50"
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_CONFIG[s].label}
            </option>
          ))}
        </select>
      );
    }
    return null;
  })();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Status badge */}
      <div
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${cfg.bg} ${cfg.text}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </div>

      {/* Action button */}
      {actionButton}

      {/* Notifications sent */}
      {notified && notified.length > 0 && (
        <span className="text-xs text-green-600">
          ✓ Notified {notified.length} recipient{notified.length !== 1 ? "s" : ""}
        </span>
      )}

      {/* Error */}
      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}
    </div>
  );
}
