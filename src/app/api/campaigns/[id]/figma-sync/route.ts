export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/campaigns/[id]/figma-sync
 *
 * Prepares the scaffold data payload for the Figma plugin.
 * Does NOT push to Figma directly — the plugin consumes this JSON.
 *
 * Auth: division_admin or division_designer.
 *
 * Returns:
 * {
 *   fileKey, campaignName, frames: [
 *     { name, figmaFrame, width, height, type, language, copy, activeVariables }
 *     // Carousel frames also include: slideCount, slides[]
 *   ]
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { fetchCampaignById } from "@/lib/airtable-campaigns";
import { fetchBanners } from "@/lib/airtable";
import type { Banner } from "@/lib/types";
import type { FormatFieldConfig } from "@/lib/airtable-campaigns";

const BASE_ID = process.env.AIRTABLE_BASE_ID || "appIqinespXjbIERp";
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;

// All variable slots in canonical order
const ALL_VARIABLES = ["H1", "H2", "H3", "CTA", "Price_Tag", "Illustration"] as const;
type VariableSlot = (typeof ALL_VARIABLES)[number];

/** Extract copy values for a given language from a banner record */
function extractCopy(
  banner: Banner,
  language: string,
  activeVariables: string[]
): Record<string, string> {
  const copy: Record<string, string> = {};

  const langUpper = language.toUpperCase();

  for (const slot of activeVariables) {
    let value = "";
    if (slot === "H1") {
      value = langUpper === "ET" ? banner.h1ET : langUpper === "EN" ? banner.h1EN : banner.h1ET;
    } else if (slot === "H2") {
      value = langUpper === "ET" ? banner.h2ET : langUpper === "EN" ? banner.h2EN : banner.h2ET;
    } else if (slot === "H3") {
      value = langUpper === "ET" ? banner.h3ET : langUpper === "EN" ? banner.h3EN : banner.h3ET;
    } else if (slot === "CTA") {
      value = langUpper === "ET" ? banner.ctaET : langUpper === "EN" ? banner.ctaEN : banner.ctaET;
    } else if (slot === "Price_Tag") {
      value = banner.priceTag;
    } else if (slot === "Illustration") {
      value = banner.illustration;
    }
    copy[slot] = value;
  }

  return copy;
}

/** Derive active variables for a format from Field_Config.formatConfigs */
function getActiveVariables(
  formatName: string,
  formatConfigs: Record<string, FormatFieldConfig> | undefined,
  fallbackVariables: string[]
): string[] {
  if (!formatConfigs || !formatName) return fallbackVariables;
  const cfg = formatConfigs[formatName];
  if (!cfg || !cfg.variables || cfg.variables.length === 0) return fallbackVariables;
  return cfg.variables;
}

/** Derive active variables for a specific slide index */
function getSlideActiveVariables(
  formatName: string,
  slideIndex: number,
  formatConfigs: Record<string, FormatFieldConfig> | undefined,
  fallbackVariables: string[]
): string[] {
  if (!formatConfigs || !formatName) return fallbackVariables;
  const cfg = formatConfigs[formatName];
  if (!cfg) return fallbackVariables;

  // Check per-slide config first
  if (cfg.slides && cfg.slides.length > 0) {
    const slideCfg = cfg.slides.find((s) => s.index === slideIndex);
    if (slideCfg && slideCfg.variables && slideCfg.variables.length > 0) {
      return slideCfg.variables;
    }
  }

  // Fall back to format-level variables
  return cfg.variables && cfg.variables.length > 0 ? cfg.variables : fallbackVariables;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await currentUser();
    const role = user?.publicMetadata?.role as string | undefined;
    if (role !== "division_admin" && role !== "division_designer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const campaignId = params.id;

    // ── 1. Fetch campaign ───────────────────────────────────────────────────
    const campaign = await fetchCampaignById(campaignId);
    const fieldConfig = campaign.fieldConfig;
    const formatConfigs = fieldConfig?.formatConfigs;
    const fallbackVariables = fieldConfig?.variables || [...ALL_VARIABLES];

    // Figma file key — from Airtable field (fetched raw since Campaign interface
    // doesn't yet include figmaCampaignFile — we'll read it from the raw record)
    const rawCampaignRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CAMPAIGNS_TABLE}/${campaignId}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
    );
    if (!rawCampaignRes.ok) {
      throw new Error(`Failed to fetch campaign raw record: ${rawCampaignRes.status}`);
    }
    const rawCampaign = await rawCampaignRes.json();
    const figmaCampaignFile =
      (rawCampaign.fields?.["Figma_Campaign_File"] as string) || "";

    // ── 2. Fetch all banners (including Slides) ─────────────────────────────
    const allBanners = await fetchBanners(BASE_ID, campaign.name, undefined, true);

    // Separate by type
    const standardBanners = allBanners.filter((b) => b.bannerType === "Standard");
    const carouselBanners = allBanners.filter((b) => b.bannerType === "Carousel");
    const slideBanners = allBanners.filter((b) => b.bannerType === "Slide");

    // ── 3. Build frames array ───────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const frames: any[] = [];

    // Standard banners → one frame each
    for (const banner of standardBanners) {
      const activeVariables = getActiveVariables(
        banner.formatName,
        formatConfigs,
        fallbackVariables
      );
      const language = banner.language || "ET";
      const copy = extractCopy(banner, language, activeVariables);

      frames.push({
        recordId: banner.id,
        name: banner.bannerName,
        figmaFrame: banner.figmaFrame,
        width: banner.width,
        height: banner.height,
        type: "Standard",
        language,
        copy,
        activeVariables,
      });
    }

    // Carousel banners → frame + slides array
    for (const carousel of carouselBanners) {
      const activeVariables = getActiveVariables(
        carousel.formatName,
        formatConfigs,
        fallbackVariables
      );
      const language = carousel.language || "ET";

      // Find child slides for this carousel
      const childSlides = slideBanners
        .filter((s) => s.parentBannerIds.includes(carousel.id))
        .sort((a, b) => (a.slideIndex ?? 0) - (b.slideIndex ?? 0));

      const slidesPayload = childSlides.map((slide) => {
        const slideVars = getSlideActiveVariables(
          carousel.formatName,
          slide.slideIndex ?? 1,
          formatConfigs,
          activeVariables
        );
        const slideCopy = extractCopy(slide, language, slideVars);
        return {
          recordId: slide.id,
          index: slide.slideIndex ?? 1,
          name: slide.bannerName,
          copy: slideCopy,
          activeVariables: slideVars,
        };
      });

      frames.push({
        recordId: carousel.id,
        name: carousel.bannerName,
        figmaFrame: carousel.figmaFrame,
        width: carousel.width,
        height: carousel.height,
        type: "Carousel",
        language,
        slideCount: childSlides.length,
        copy: extractCopy(carousel, language, activeVariables),
        activeVariables,
        slides: slidesPayload,
      });
    }

    // ── 4. Update Last_Figma_Sync on campaign ───────────────────────────────
    const now = new Date().toISOString();
    await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CAMPAIGNS_TABLE}/${campaignId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: { Last_Figma_Sync: now } }),
      }
    );

    // ── 5. Return payload ───────────────────────────────────────────────────
    return NextResponse.json({
      fileKey: figmaCampaignFile,
      campaignId,
      campaignName: campaign.name,
      syncedAt: now,
      frameCount: frames.length,
      frames,
    });
  } catch (err) {
    console.error("POST /api/campaigns/[id]/figma-sync error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET — same payload, for the Figma plugin to poll
export async function GET(
  req: NextRequest,
  context: { params: { id: string } }
) {
  return POST(req, context);
}
