"use client";

import Link from "next/link";
import { useState } from "react";
import type { ClientRecord } from "@/lib/airtable-clients";

interface ClientCardProps {
  client: ClientRecord;
}

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-500",
  Draft: "bg-gray-400",
  Archived: "bg-red-400",
};

const STATUS_BADGE: Record<string, string> = {
  Active: "bg-green-50 text-green-700 ring-green-600/20",
  Draft: "bg-gray-50 text-gray-600 ring-gray-500/20",
  Archived: "bg-red-50 text-red-700 ring-red-600/20",
};

export default function ClientCard({ client }: ClientCardProps) {
  const [archiving, setArchiving] = useState(false);

  const handleArchive = async () => {
    if (!confirm(`Archive "${client.name}"? This will hide it from the client list.`)) return;
    setArchiving(true);
    try {
      await fetch(`/api/admin/clients/${client.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Archived" }),
      });
      window.location.reload();
    } catch {
      alert("Failed to archive client.");
      setArchiving(false);
    }
  };

  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "divisionbanners.ee";

  return (
    <div className="relative flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_COLORS[client.status] || "bg-gray-400"}`}
          />
          <h3 className="truncate text-base font-semibold text-gray-900">
            {client.name}
          </h3>
        </div>
        <span
          className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[client.status] || STATUS_BADGE.Draft}`}
        >
          {client.status}
        </span>
      </div>

      {/* Meta */}
      <div className="mt-3 space-y-1 text-sm text-gray-500">
        <div className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
          </svg>
          <span>{client.languages.join(", ") || "—"}</span>
          <span className="text-gray-300">·</span>
          <span>{client.formatIds.length} formats</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span className="truncate text-xs text-gray-400">
            {client.subdomain}.{appDomain}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 pt-3 border-t border-gray-100">
        <a
          href={`http://${client.subdomain}.${appDomain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-center text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Open
        </a>
        <Link
          href={`/admin/${client.id}/edit`}
          className="flex-1 rounded-md border border-gray-200 px-3 py-1.5 text-center text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Edit
        </Link>
        <button
          onClick={handleArchive}
          disabled={archiving}
          className="flex-1 rounded-md border border-red-100 px-3 py-1.5 text-center text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {archiving ? "..." : "Archive"}
        </button>
      </div>
    </div>
  );
}
