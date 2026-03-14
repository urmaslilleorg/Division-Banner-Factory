/**
 * GET /api/campaigns/lookup?slug=avene_sprin2026
 *
 * Public endpoint (no auth) — called by the Figma plugin.
 * Resolves a campaign name / URL slug / rec... ID to the Airtable record ID.
 *
 * CORS: allows all origins so the Figma plugin iframe can call it.
 *
 * Response: { recordId: string, campaignName: string }
 * Errors:   { error: string } with 400 or 404 status
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAllCampaigns } from "@/lib/airtable-campaigns";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.trim();

  if (!slug) {
    return NextResponse.json(
      { error: "Missing slug parameter" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // If the caller already has a record ID, return it directly
  if (slug.startsWith("rec")) {
    return NextResponse.json(
      { recordId: slug, campaignName: slug },
      { headers: CORS_HEADERS }
    );
  }

  try {
    const campaigns = await fetchAllCampaigns();

    const found =
      // 1. Exact name match (e.g. "Avene_Sprin2026")
      campaigns.find((c) => c.name === slug) ||
      // 2. Case-insensitive exact match
      campaigns.find((c) => c.name.toLowerCase() === slug.toLowerCase()) ||
      // 3. Slug-from-name: "Avene Spring 2026" → "avene-spring-2026"
      campaigns.find(
        (c) => c.name.toLowerCase().replace(/\s+/g, "-") === slug.toLowerCase()
      ) ||
      // 4. Spaces-to-underscores: "avene_sprin2026" → "Avene_Sprin2026"
      campaigns.find(
        (c) => c.name.toLowerCase().replace(/\s+/g, "_") === slug.toLowerCase()
      );

    if (!found) {
      return NextResponse.json(
        { error: `No campaign found for: "${slug}"` },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      { recordId: found.id, campaignName: found.name },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Lookup failed: ${String(err)}` },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
