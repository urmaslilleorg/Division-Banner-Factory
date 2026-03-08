"use client";

import { useState, useCallback, useRef } from "react";
import { Banner } from "@/lib/types";
import { FieldConfig } from "@/lib/airtable-campaigns";

interface CopyEditorTableProps {
  campaignId: string;
  banners: Banner[];
  fieldConfig: FieldConfig;
  userRole: string;
}

type SaveState = "idle" | "saving" | "success" | "error";

interface CellState {
  bannerId: string;
  field: string;
  state: SaveState;
}

// Map variable names to Banner field keys
const VARIABLE_TO_FIELD: Record<string, Record<string, keyof Banner>> = {
  H1: { ET: "h1ET", EN: "h1EN" },
  H2: { ET: "h2ET", EN: "h2EN" },
  H3: { ET: "h3ET", EN: "h3EN" },
  CTA: { ET: "ctaET", EN: "ctaEN" },
  Price_Tag: { ET: "priceTag", EN: "priceTag" },
  Illustration: { ET: "illustration", EN: "illustration" },
};

// Map Banner field key → Airtable field name
const FIELD_TO_AIRTABLE: Record<string, string> = {
  h1ET: "H1_ET", h1EN: "H1_EN",
  h2ET: "H2_ET", h2EN: "H2_EN",
  h3ET: "H3_ET", h3EN: "H3_EN",
  ctaET: "CTA_ET", ctaEN: "CTA_EN",
  priceTag: "Price_Tag",
  illustration: "Illustration",
};

function isBannerRowComplete(
  banner: Banner,
  variables: string[],
  languages: string[]
): boolean {
  for (const variable of variables) {
    for (const lang of languages) {
      const fieldKey = VARIABLE_TO_FIELD[variable]?.[lang];
      if (!fieldKey) continue;
      const value = banner[fieldKey] as string | undefined;
      if (!value || value.trim() === "") return false;
    }
  }
  return true;
}

export default function CopyEditorTable({
  banners: initialBanners,
  fieldConfig,
  userRole,
}: CopyEditorTableProps) {
  const [banners, setBanners] = useState<Banner[]>(initialBanners);
  const [cellState, setCellState] = useState<CellState | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isReadOnly = userRole === "client_reviewer";

  const { variables, languages } = fieldConfig;

  // Build column list: for each variable × language
  const columns: { variable: string; language: string; fieldKey: keyof Banner; label: string }[] = [];
  for (const variable of variables) {
    for (const lang of languages) {
      const fieldKey = VARIABLE_TO_FIELD[variable]?.[lang];
      if (!fieldKey) continue;
      columns.push({
        variable,
        language: lang,
        fieldKey,
        label: languages.length > 1 ? `${variable}_${lang}` : variable,
      });
    }
  }

  const handleBlur = useCallback(
    async (bannerId: string, fieldKey: keyof Banner, airtableField: string, value: string) => {
      // Find original value
      const banner = banners.find((b) => b.id === bannerId);
      if (!banner) return;
      const originalValue = (banner[fieldKey] as string) || "";
      if (value === originalValue) return; // No change

      // Optimistic update
      setBanners((prev) =>
        prev.map((b) =>
          b.id === bannerId ? { ...b, [fieldKey]: value } : b
        )
      );

      setCellState({ bannerId, field: String(fieldKey), state: "saving" });

      try {
        const res = await fetch(`/api/banners/${bannerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [airtableField]: value }),
        });
        if (!res.ok) throw new Error("Save failed");
        setCellState({ bannerId, field: String(fieldKey), state: "success" });
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCellState(null), 1500);
      } catch {
        // Revert on error
        setBanners((prev) =>
          prev.map((b) =>
            b.id === bannerId ? { ...b, [fieldKey]: originalValue } : b
          )
        );
        setCellState({ bannerId, field: String(fieldKey), state: "error" });
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCellState(null), 2000);
      }
    },
    [banners]
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 whitespace-nowrap">
              Format
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
              Lang
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
              Status
            </th>
            {columns.map((col) => (
              <th
                key={`${col.variable}-${col.language}`}
                className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400 min-w-[160px]"
              >
                {col.label}
              </th>
            ))}
            <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
              Ready
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {banners.map((banner) => {
            const isComplete = isBannerRowComplete(banner, variables, languages);
            return (
              <tr key={banner.id} className="hover:bg-gray-50/50">
                {/* Format */}
                <td className="sticky left-0 z-10 bg-white px-4 py-2 font-mono text-xs text-gray-600 whitespace-nowrap">
                  {banner.format || `${banner.width}×${banner.height}`}
                </td>
                {/* Language */}
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      banner.language === "ET"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {banner.language}
                  </span>
                </td>
                {/* Status */}
                <td className="px-3 py-2">
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                    {banner.status}
                  </span>
                </td>
                {/* Copy cells */}
                {columns.map((col) => {
                  const value = (banner[col.fieldKey] as string) || "";
                  const isEmpty = value.trim() === "";
                  const isSaving =
                    cellState?.bannerId === banner.id &&
                    cellState.field === String(col.fieldKey) &&
                    cellState.state === "saving";
                  const isSuccess =
                    cellState?.bannerId === banner.id &&
                    cellState.field === String(col.fieldKey) &&
                    cellState.state === "success";
                  const isError =
                    cellState?.bannerId === banner.id &&
                    cellState.field === String(col.fieldKey) &&
                    cellState.state === "error";

                  return (
                    <td
                      key={`${banner.id}-${col.variable}-${col.language}`}
                      className={`px-2 py-1.5 transition-colors ${
                        col.variable === "H1" && isEmpty && !isReadOnly
                          ? "bg-amber-50"
                          : ""
                      } ${isSuccess ? "bg-emerald-50" : ""} ${isError ? "bg-red-50" : ""}`}
                    >
                      {isReadOnly ? (
                        <span className="block min-h-[28px] text-sm text-gray-700">
                          {value}
                        </span>
                      ) : (
                        <input
                          type="text"
                          defaultValue={value}
                          disabled={isSaving}
                          onBlur={(e) =>
                            handleBlur(
                              banner.id,
                              col.fieldKey,
                              FIELD_TO_AIRTABLE[String(col.fieldKey)] || String(col.fieldKey),
                              e.target.value
                            )
                          }
                          placeholder={col.variable === "H1" ? "Required" : ""}
                          className={`w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 ${
                            isSaving
                              ? "border-gray-200 bg-gray-50 text-gray-400"
                              : isSuccess
                              ? "border-emerald-300 bg-emerald-50"
                              : isError
                              ? "border-red-300 bg-red-50"
                              : col.variable === "H1" && isEmpty
                              ? "border-amber-300 bg-amber-50"
                              : "border-gray-200 bg-white"
                          }`}
                        />
                      )}
                    </td>
                  );
                })}
                {/* Ready badge */}
                <td className="px-3 py-2">
                  {isComplete ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      Ready ✓
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                      Incomplete
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
