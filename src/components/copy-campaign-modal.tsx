"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CopyCampaignModalProps {
  campaignId: string;
  campaignName: string;
  /** Current launch month string, e.g. "March 2026" */
  launchMonth?: string;
}

const MONTHS: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4,
  May: 5, June: 6, July: 7, August: 8,
  September: 9, October: 10, November: 11, December: 12,
};

function launchMonthToPath(launchMonth: string | undefined): string {
  if (!launchMonth) return "/campaigns?preview=true";
  const [monthName, yearStr] = launchMonth.split(" ");
  const month = MONTHS[monthName];
  const year = parseInt(yearStr, 10);
  if (!month || isNaN(year)) return "/campaigns?preview=true";
  return `/${year}/${month}?preview=true`;
}

export function CopyCampaignModal({
  campaignId,
  campaignName,
  launchMonth,
}: CopyCampaignModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(`${campaignName} (copy)`);
  const [copyBanners, setCopyBanners] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const handleCopy = async () => {
    if (!newName.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: newName.trim(), copyBanners }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || "Failed to copy campaign");
      }
      const data = await res.json() as {
        campaignId: string;
        campaignName: string;
        bannerCount: number;
      };
      // Redirect to the new campaign's month view
      // The new campaign inherits launchMonth from the source
      const destination = launchMonthToPath(launchMonth);
      setOpen(false);
      router.push(destination);
      router.refresh();
      // Brief flash — the page will reload with the new campaign visible
      void data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => {
          setNewName(`${campaignName} (copy)`);
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        title="Copy campaign"
      >
        <Copy className="h-3.5 w-3.5" />
        Copy
      </button>

      {/* Modal backdrop + dialog */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl p-6">
            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="text-lg font-medium text-gray-900 mb-1">Copy Campaign</h2>
            <p className="text-sm text-gray-500 mb-5">
              Creates a duplicate of <span className="font-medium text-gray-700">{campaignName}</span>.
            </p>

            {/* New name input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                New campaign name
              </label>
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isSubmitting) handleCopy();
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                placeholder="Campaign name"
              />
            </div>

            {/* Copy banners checkbox */}
            <label className="flex items-center gap-2.5 mb-5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={copyBanners}
                onChange={(e) => setCopyBanners(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
              />
              <span className="text-sm text-gray-700">
                Copy banner records (resets Status and Approval)
              </span>
            </label>

            {/* Error */}
            {error && (
              <p className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCopy}
                disabled={isSubmitting || !newName.trim()}
                className="gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Copying…
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Campaign
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
