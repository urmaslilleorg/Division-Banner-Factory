"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Clipboard, Check, Pencil, Plus } from "lucide-react";

interface ExternalCopySheetProps {
  campaignId: string;
  initialUrl: string | null;
  userRole: string;
}

// ── URL helpers ──────────────────────────────────────────────────────────────

function validateUrl(url: string): string | null {
  const trimmed = url.trim();
  if (
    trimmed.startsWith("https://airtable.com/shr") ||
    trimmed.startsWith("https://airtable.com/app") ||
    trimmed.startsWith("https://airtable.com/embed/")
  ) return null;
  if (trimmed.startsWith("https://docs.google.com/spreadsheets")) return null;
  return "Invalid URL. Must be an Airtable shared view (https://airtable.com/shr…) or Google Sheets URL.";
}

function toEmbedUrl(url: string): string {
  const trimmed = url.trim();
  // Already embed URL
  if (trimmed.includes("airtable.com/embed/")) return trimmed;
  // Airtable shr URL → insert /embed/
  if (trimmed.startsWith("https://airtable.com/shr")) {
    return trimmed.replace("https://airtable.com/", "https://airtable.com/embed/");
  }
  // Airtable app URL (e.g. /appXXX/shrXXX)
  if (trimmed.startsWith("https://airtable.com/app")) {
    return trimmed.replace("https://airtable.com/", "https://airtable.com/embed/");
  }
  // Google Sheets: replace /edit or /view with /pubhtml
  if (trimmed.startsWith("https://docs.google.com/spreadsheets")) {
    return trimmed
      .replace(/\/edit(\?.*)?$/, "/pubhtml")
      .replace(/\/view(\?.*)?$/, "/pubhtml")
      .replace(/\/pub(\?.*)?$/, "/pubhtml");
  }
  return trimmed;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ExternalCopySheet({
  campaignId,
  initialUrl,
  userRole,
}: ExternalCopySheetProps) {
  const isAdmin = userRole === "division_admin";

  const [savedUrl, setSavedUrl] = useState<string | null>(initialUrl);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [inputUrl, setInputUrl] = useState(initialUrl ?? "");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSave = useCallback(async () => {
    const trimmed = inputUrl.trim();
    const err = validateUrl(trimmed);
    if (err) { setUrlError(err); return; }
    setUrlError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copySheetUrl: trimmed }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSavedUrl(trimmed);
      setIsEditing(false);
      setIsExpanded(true);
      setIframeLoaded(false);
      setIframeError(false);
    } catch {
      setUrlError("Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }, [campaignId, inputUrl]);

  const handleCopyLink = useCallback(async () => {
    if (!savedUrl) return;
    try {
      await navigator.clipboard.writeText(savedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [savedUrl]);

  const handleOpenTab = useCallback(() => {
    if (!savedUrl) return;
    window.open(savedUrl, "_blank", "noopener,noreferrer");
  }, [savedUrl]);

  const embedUrl = savedUrl ? toEmbedUrl(savedUrl) : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white mb-6">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setIsExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
          External Copy Sheet
          {savedUrl && !isExpanded && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200">
              <Check className="h-3 w-3" /> Connected
            </span>
          )}
        </button>

        {/* Right-side actions when URL is set and not editing */}
        {savedUrl && !isEditing && isAdmin && (
          <button
            onClick={() => { setInputUrl(savedUrl); setIsEditing(true); setIsExpanded(true); setUrlError(null); }}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">

          {/* No URL yet — prompt to add */}
          {!savedUrl && !isEditing && (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-1">
                Connect an Airtable shared view or Google Sheet for external collaborators.
              </p>
              {isAdmin && (
                <button
                  onClick={() => { setIsEditing(true); setInputUrl(""); setUrlError(null); }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Add shared view URL
                </button>
              )}
            </div>
          )}

          {/* URL input form */}
          {isEditing && isAdmin && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Shared view URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={inputUrl}
                  onChange={(e) => { setInputUrl(e.target.value); setUrlError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setIsEditing(false); setUrlError(null); } }}
                  placeholder="https://airtable.com/shr… or https://docs.google.com/spreadsheets/…"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  disabled={isSaving || !inputUrl.trim()}
                  className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {isSaving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => { setIsEditing(false); setUrlError(null); }}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
              {urlError && (
                <p className="text-xs text-red-500">{urlError}</p>
              )}
            </div>
          )}

          {/* Iframe embed */}
          {savedUrl && !isEditing && embedUrl && (
            <div className="space-y-3">
              {/* Loading skeleton */}
              {!iframeLoaded && !iframeError && (
                <div className="h-[500px] w-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                    <p className="text-xs text-gray-400">Loading shared view…</p>
                  </div>
                </div>
              )}

              {/* Error state */}
              {iframeError && (
                <div className="h-[200px] w-full rounded-lg border border-red-100 bg-red-50 flex items-center justify-center px-6 text-center">
                  <p className="text-sm text-red-500">
                    Unable to load the shared view. Check the URL and make sure the view is shared publicly.
                  </p>
                </div>
              )}

              {/* Actual iframe */}
              <iframe
                src={embedUrl}
                width="100%"
                height="500"
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  display: iframeLoaded && !iframeError ? "block" : "none",
                }}
                onLoad={() => setIframeLoaded(true)}
                onError={() => { setIframeError(true); setIframeLoaded(true); }}
                title="External Copy Sheet"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              />

              {/* Action buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {copied ? (
                    <><Check className="h-4 w-4 text-green-500" /> Link copied!</>
                  ) : (
                    <><Clipboard className="h-4 w-4" /> Copy share link</>
                  )}
                </button>
                <button
                  onClick={handleOpenTab}
                  className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" /> Open in new tab
                </button>
                <span className="ml-auto text-xs text-gray-400">
                  Shared with: anyone with the link (no login required)
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
