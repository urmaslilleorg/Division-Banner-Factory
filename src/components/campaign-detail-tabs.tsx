"use client";

import { useState, useCallback } from "react";
import { Banner } from "@/lib/types";
import { FieldConfig } from "@/lib/airtable-campaigns";
import type { ClientVariable } from "@/lib/types";
import CopyEditorTable from "@/components/copy-editor-table";
import BannerGrid from "@/components/banner-grid";
import ExternalCopySheet from "@/components/external-copy-sheet";

type Tab = "copy" | "preview";

interface CampaignDetailTabsProps {
  campaignId: string;
  banners: Banner[];
  fieldConfig: FieldConfig;
  clientVariables: ClientVariable[];
  clientFormatIds?: string[];
  userRole: string;
  defaultTab?: Tab;
  copySheetUrl?: string | null;
  /** Full public URL for the campaign (without ?preview=true) — used for Share button */
  campaignPublicUrl?: string;
}

export default function CampaignDetailTabs({
  campaignId,
  banners,
  fieldConfig,
  clientVariables,
  clientFormatIds = [],
  userRole,
  defaultTab = "copy",
  copySheetUrl = null,
  campaignPublicUrl,
}: CampaignDetailTabsProps) {
  // Client roles always land on Preview and cannot see Copy & Assets
  const isClientRole = userRole === "client_reviewer" || userRole === "client_viewer";
  const isAdminOrDesigner = userRole === "division_admin" || userRole === "division_designer";

  const effectiveDefaultTab: Tab = isClientRole ? "preview" : defaultTab;
  const [activeTab, setActiveTab] = useState<Tab>(effectiveDefaultTab);

  // Share preview link state
  const [copyLinkState, setCopyLinkState] = useState<"idle" | "copied">("idle");

  // Scenario 15: trigger blur on the active input before switching tabs so
  // the onBlur auto-save in CopyEditorTable fires before content unmounts.
  function switchTab(tab: Tab) {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setActiveTab(tab);
  }

  const handleSharePreviewLink = useCallback(async () => {
    const url = campaignPublicUrl || window.location.href.split("?")[0];
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for non-secure contexts
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopyLinkState("copied");
    setTimeout(() => setCopyLinkState("idle"), 2500);
  }, [campaignPublicUrl]);

  return (
    <div>
      {/* Tab bar — Copy & Assets hidden from client roles */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex items-center justify-between">
          <nav className="-mb-px flex gap-6" aria-label="Tabs">
            {!isClientRole && (
              <button
                onClick={() => switchTab("copy")}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "copy"
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300"
                }`}
              >
                Copy &amp; Assets
              </button>
            )}
            <button
              onClick={() => switchTab("preview")}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "preview"
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300"
              }`}
            >
              Preview
            </button>
          </nav>

          {/* Share preview link — visible to admin/designer only, shown on Preview tab */}
          {isAdminOrDesigner && activeTab === "preview" && (
            <button
              onClick={handleSharePreviewLink}
              className={`mb-1 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                copyLinkState === "copied"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900"
              }`}
            >
              {copyLinkState === "copied" ? (
                <>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Preview link copied — share with client
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  Share preview link
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Copy & Assets tab — only accessible to admin/designer */}
      {activeTab === "copy" && !isClientRole && (
        <div className="space-y-4">
          {/* External Copy Sheet section — collapsible, at top */}
          <ExternalCopySheet
            campaignId={campaignId}
            initialUrl={copySheetUrl}
            userRole={userRole}
          />

          {/* Divider info text */}
          {copySheetUrl && (
            <p className="text-xs text-gray-400 text-center -mt-2 mb-2">
              Both views show the same data. Changes in the external sheet appear here after page refresh.
            </p>
          )}

          {/* Inline Copy Editor — primary editing interface */}
          {fieldConfig.variables.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
              <p className="text-sm text-gray-400">
                No copy variables configured for this campaign.
              </p>
              <p className="mt-1 text-xs text-gray-300">
                Edit the campaign to add variables in the Campaign Builder.
              </p>
            </div>
          ) : banners.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
              <p className="text-sm text-gray-400">No banners found for this campaign.</p>
            </div>
          ) : (
            <CopyEditorTable
              campaignId={campaignId}
              banners={banners}
              fieldConfig={fieldConfig}
              userRole={userRole}
              clientVariables={clientVariables}
              clientFormatIds={clientFormatIds}
            />
          )}
        </div>
      )}

      {/* Preview tab */}
      {activeTab === "preview" && (
        <BannerGrid
          banners={banners}
          userRole={userRole}
        />
      )}
    </div>
  );
}
