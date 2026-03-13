"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function CampaignError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Campaign detail error:", error);
  }, [error]);

  return (
    <div className="space-y-6">
      <Link
        href="/campaigns?preview=true"
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
      >
        ← Back to Calendar
      </Link>
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
        <h2 className="text-xl font-light text-gray-900 mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-gray-500 mb-6 max-w-md">
          {error.message?.includes("Airtable")
            ? "Could not load this campaign — Airtable connection issue. Please try again."
            : "An unexpected error occurred while loading this campaign."}
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 mb-4 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            Try again
          </button>
          <Link
            href="/campaigns?preview=true"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Back to Calendar
          </Link>
        </div>
      </div>
    </div>
  );
}
