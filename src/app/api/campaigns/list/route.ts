/**
 * GET /api/campaigns/list?client=<clientName>
 *
 * Public endpoint (no auth) — used by the Figma plugin.
 * Returns all active campaigns for a given client name.
 *
 * Response items:
 *   { id, name, month, bannerCount, formatCount }
 *
 * CORS: allows all origins.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAllCampaigns } from "@/lib/airtable-campaigns";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;
const BASE_ID = process.env.AIRTABLE_BASE_ID || "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const clientName = req.nextUrl.searchParams.get("client")?.trim();

  if (!clientName) {
    return NextResponse.json(
      { error: "Missing client parameter" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    // Fetch campaigns filtered by client name, active only
    const allCampaigns = await fetchAllCampaigns(clientName);
    const activeCampaigns = allCampaigns.filter((c) => c.active);

    // For each campaign, count banners and unique formats
    // We fetch banner counts in parallel using a lightweight Airtable query
    const results = await Promise.all(
      activeCampaigns.map(async (campaign) => {
        let bannerCount = 0;
        let formatCount = 0;

        try {
          // Simple count query — fetch Format_Name for all non-Slide banners in this campaign
          const safeClientName = campaign.name.replace(/"/g, "'");
          const countParams = new URLSearchParams();
          countParams.set("filterByFormula", `AND({Campaign_Name}="${safeClientName}",{Banner_Type}!="Slide")`);
          countParams.set("pageSize", "100");
          countParams.append("fields[]", "Format_Name");

          const res = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}?${countParams}`,
            { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
          );

          if (res.ok) {
            const data = await res.json();
            const records = data.records || [];
            bannerCount = records.length;
            const formats = new Set(
              records.map((r: { fields: { Format_Name?: string } }) => r.fields?.Format_Name).filter(Boolean)
            );
            formatCount = formats.size;
          }
        } catch {
          // Non-fatal — just leave counts as 0
        }

        return {
          id: campaign.id,
          name: campaign.name,
          month: campaign.launchMonth || "",
          bannerCount,
          formatCount,
        };
      })
    );

    // Sort by name
    results.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(results, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("GET /api/campaigns/list error:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
