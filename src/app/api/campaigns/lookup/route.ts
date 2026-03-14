/**
 * GET /api/campaigns/lookup?slug=avene_sprin2026
 *
 * Resolves a campaign URL slug (or record ID) to the Airtable record ID.
 * Used by the Figma plugin so users only need to paste the campaign URL —
 * the plugin extracts the slug and calls this endpoint to get the rec... ID.
 *
 * Response: { recordId: string, campaignName: string }
 * Errors:   { error: string } with 400 or 404 status
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchAllCampaigns } from "@/lib/airtable-campaigns";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.trim();

  if (!slug) {
    return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
  }

  // If the caller already has a record ID, just return it directly
  if (slug.startsWith("rec")) {
    return NextResponse.json({ recordId: slug, campaignName: slug });
  }

  try {
    const campaigns = await fetchAllCampaigns();

    // Mirror the same resolution order used in the campaign detail page
    const found =
      // 1. Exact name match (e.g. "Avene_Sprin2026")
      campaigns.find((c) => c.name === slug) ||
      // 2. Case-insensitive exact match
      campaigns.find((c) => c.name.toLowerCase() === slug.toLowerCase()) ||
      // 3. Slug-from-name: "Avene Spring 2026" → "avene-spring-2026"
      campaigns.find(
        (c) => c.name.toLowerCase().replace(/\s+/g, "-") === slug.toLowerCase()
      ) ||
      // 4. Spaces-to-underscores variant: "avene_sprin2026" → "Avene_Sprin2026"
      campaigns.find(
        (c) => c.name.toLowerCase().replace(/\s+/g, "_") === slug.toLowerCase()
      );

    if (!found) {
      return NextResponse.json(
        { error: `No campaign found for slug: ${slug}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ recordId: found.id, campaignName: found.name });
  } catch (err) {
    return NextResponse.json(
      { error: `Lookup failed: ${String(err)}` },
      { status: 500 }
    );
  }
}
