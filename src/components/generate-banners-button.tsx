"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface GenerateBannersButtonProps {
  campaignId: string;
  missingCount: number;
}

export default function GenerateBannersButton({
  campaignId,
  missingCount: initialMissingCount,
}: GenerateBannersButtonProps) {
  const router = useRouter();
  const [missingCount, setMissingCount] = useState(initialMissingCount);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{
    bannersCreated: number;
    slidesCreated: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (missingCount === 0 && !result) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
          All formats have banners ✓
        </span>
      </div>
    );
  }

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/generate-banners`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to generate banners");
        return;
      }

      setResult({ bannersCreated: data.bannersCreated, slidesCreated: data.slidesCreated });
      setMissingCount(0);
      // Refresh the page to show newly created banners
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsGenerating(false);
    }
  };

  if (result) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
          ✓ Created {result.bannersCreated} banner{result.bannersCreated !== 1 ? "s" : ""}
          {result.slidesCreated > 0 ? ` + ${result.slidesCreated} slide${result.slidesCreated !== 1 ? "s" : ""}` : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <span className="animate-spin inline-block h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
              Generating…
            </>
          ) : (
            <>
              + Generate {missingCount} missing banner{missingCount !== 1 ? "s" : ""}
            </>
          )}
        </button>
        {!isGenerating && (
          <span className="text-xs text-gray-400">
            {missingCount} format × language combination{missingCount !== 1 ? "s" : ""} without banners
          </span>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
