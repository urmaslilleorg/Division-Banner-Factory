"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import CreateFromBannersFlow from "./create-from-banners-flow";
import { useRouter } from "next/navigation";

interface PrefilledConfig {
  variables: string[];
  copy: Record<string, string>;
}

interface CampaignHeaderButtonsProps {
  hasAiKey: boolean;
  newCampaignHref: string;
}

export default function CampaignHeaderButtons({
  hasAiKey,
  newCampaignHref,
}: CampaignHeaderButtonsProps) {
  const [showBannersFlow, setShowBannersFlow] = useState(false);
  const router = useRouter();

  const handleConfigReady = (config: PrefilledConfig) => {
    setShowBannersFlow(false);
    // Encode the prefilled config as a URL search param and navigate to new campaign
    const params = new URLSearchParams();
    params.set("prefill", JSON.stringify(config));
    router.push(`${newCampaignHref}&${params.toString()}`);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Link
          href={newCampaignHref}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New campaign
        </Link>

        {hasAiKey && (
          <button
            type="button"
            onClick={() => setShowBannersFlow(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-600 hover:border-indigo-500 hover:text-indigo-900 transition-colors"
          >
            Create from existing banners
          </button>
        )}
      </div>

      {showBannersFlow && (
        <CreateFromBannersFlow
          onConfigReady={handleConfigReady}
          onCancel={() => setShowBannersFlow(false)}
        />
      )}
    </>
  );
}
