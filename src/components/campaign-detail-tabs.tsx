"use client";

import { useState } from "react";
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
  userRole: string;
  defaultTab?: Tab;
  copySheetUrl?: string | null;
}

export default function CampaignDetailTabs({
  campaignId,
  banners,
  fieldConfig,
  clientVariables,
  userRole,
  defaultTab = "copy",
  copySheetUrl = null,
}: CampaignDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);

  // Scenario 15: trigger blur on the active input before switching tabs so
  // the onBlur auto-save in CopyEditorTable fires before content unmounts.
  function switchTab(tab: Tab) {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setActiveTab(tab);
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-6" aria-label="Tabs">
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
      </div>

      {/* Copy & Assets tab */}
      {activeTab === "copy" && (
        <div className="space-y-4">
          {/* Task 1 & 5: External Copy Sheet section — collapsible, at top */}
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
