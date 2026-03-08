"use client";

import { useEffect, useState } from "react";

interface Asset {
  nodeId: string;
  name: string;
  group: string;
  thumbnailUrl: string | null;
}

interface Props {
  clientId: string;
  figmaAssetFile: string;
}

const ASSET_GROUPS = ["Backgrounds", "Illustrations", "Logos", "Overlays", "Products"];

export default function AssetLibraryViewer({ clientId, figmaAssetFile }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string>("all");

  useEffect(() => {
    if (!figmaAssetFile) return;
    setLoading(true);
    setError("");

    fetch(`/api/admin/clients/${clientId}/assets`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setAssets(data.assets || []))
      .catch((err) => setError(err.message || "Failed to load assets"))
      .finally(() => setLoading(false));
  }, [clientId, figmaAssetFile]);

  const copyName = (name: string) => {
    navigator.clipboard.writeText(name);
    setCopied(name);
    setTimeout(() => setCopied(null), 1500);
  };

  if (!figmaAssetFile) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 p-12 text-center">
        <p className="text-sm text-gray-500">
          No asset library configured. Add a Figma file key in{" "}
          <a href={`/admin/${clientId}/edit`} className="text-blue-600 hover:underline">
            client settings
          </a>
          .
        </p>
      </div>
    );
  }

  const groups = ["all", ...ASSET_GROUPS.filter((g) => assets.some((a) => a.group === g))];
  const filtered = activeGroup === "all" ? assets : assets.filter((a) => a.group === activeGroup);

  return (
    <div className="space-y-4">
      {/* Group tabs */}
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <button
            key={g}
            onClick={() => setActiveGroup(g)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              activeGroup === g
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {g === "all" ? "All" : g}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
          <span className="ml-3 text-sm text-gray-500">Loading assets from Figma...</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-500">
            No assets found in the &ldquo;{activeGroup}&rdquo; group.
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((asset) => (
            <div
              key={asset.nodeId}
              className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white hover:shadow-md transition-shadow"
            >
              {/* Thumbnail */}
              <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                {asset.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.thumbnailUrl}
                    alt={asset.name}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <svg
                      className="h-8 w-8 text-gray-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {/* Name + copy button */}
              <div className="border-t border-gray-100 px-2.5 py-2">
                <p className="truncate text-xs font-medium text-gray-700">{asset.name}</p>
                <p className="text-xs text-gray-400">{asset.group}</p>
              </div>

              {/* Copy button overlay */}
              <button
                onClick={() => copyName(asset.name)}
                className="absolute inset-0 flex items-center justify-center bg-gray-900/0 opacity-0 group-hover:bg-gray-900/10 group-hover:opacity-100 transition-all"
              >
                <span className="rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm">
                  {copied === asset.name ? "Copied!" : "Copy name"}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
