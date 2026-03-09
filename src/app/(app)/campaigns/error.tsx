"use client";

import { useEffect } from "react";

export default function CampaignsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Campaigns page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
      <h2 className="text-xl font-light text-gray-900 mb-2">
        Something went wrong
      </h2>
      <p className="text-sm text-gray-500 mb-6 max-w-md">
        {error.message?.includes("Airtable")
          ? "Could not load campaigns — Airtable connection issue. Please try again."
          : "An unexpected error occurred while loading this page."}
      </p>
      {error.digest && (
        <p className="text-xs text-gray-400 mb-4 font-mono">
          Error ID: {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
