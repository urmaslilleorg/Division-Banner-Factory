export const runtime = "nodejs";

/**
 * GET /api/campaigns/[id]/figma-sync
 *
 * Public endpoint (no auth) — called by the Figma plugin from Figma's sandbox.
 * Returns the structured copy payload for the plugin to create/update frames.
 *
 * CORS: allows all origins so the Figma plugin iframe can call it.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchCampaignById } from "@/lib/airtable-campaigns";
import { fetchBanners } from "@/lib/airtable";
import { fetchAllClients } from "@/lib/airtable-clients";
import type { Banner } from "@/lib/types";
import type { FormatFieldConfig } from "@/lib/airtable-campaigns";

const BASE_ID = process.env.AIRTABLE_BASE_ID || "appIqinespXjbIERp";
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY!;

// All variable slots in canonical order
const ALL_VARIABLES = ["H1", "H2", "H3", "CTA", "Price_Tag", "Illustration", "Image"] as const;

// ── CORS helpers ──────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

// ── Copy extraction ───────────────────────────────────────────────────────────

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
    } else if (slot === "Image") {
      value = banner.image;
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

  if (cfg.slides && cfg.slides.length > 0) {
    const slideCfg = cfg.slides.find((s) => s.index === slideIndex);
    if (slideCfg && slideCfg.variables && slideCfg.variables.length > 0) {
      return slideCfg.variables;
    }
  }

  return cfg.variables && cfg.variables.length > 0 ? cfg.variables : fallbackVariables;
}

// ── Frame name normalisation ─────────────────────────────────────────────────

/**
 * Ensure a Figma frame name uses the campaign-prefixed convention.
 *
 * Legacy records stored names like: _MASTER_Google_Display_Horizontal_1200x628
 * Current convention is:            Avene_Google_Display_Horizontal_1200x628
 *
 * If the stored name already starts with the campaign prefix (normalised),
 * it is returned unchanged. If it starts with _MASTER_, the prefix is replaced
 * with the normalised campaign name.
 *
 * This is a server-side safety net. The Airtable data migration will also
 * update the stored values directly.
 */
function normaliseFigmaFrame(storedName: string, campaignName: string): string {
  if (!storedName) return storedName;
  if (!storedName.startsWith("_MASTER_")) return storedName; // already correct
  const campaignNorm = campaignName
    .replace(/ä/g, "a").replace(/Ä/g, "A")
    .replace(/ö/g, "o").replace(/Ö/g, "O")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/õ/g, "o").replace(/Õ/g, "O")
    .replace(/\s+/g, "_");
  // Strip "_MASTER_" prefix and prepend campaign name
  const withoutMaster = storedName.slice("_MASTER_".length);
  return `${campaignNorm}_${withoutMaster}`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

async function handleSync(campaignId: string): Promise<NextResponse> {
  // ── 1. Fetch campaign ───────────────────────────────────────────────────────
  const campaign = await fetchCampaignById(campaignId);
  const fieldConfig = campaign.fieldConfig;
  const formatConfigs = fieldConfig?.formatConfigs;
  // Use campaign-level variables as fallback; only fall back to ALL_VARIABLES
  // if fieldConfig is entirely absent. An empty array means "no campaign default"
  // has been configured — in that case also use ALL_VARIABLES as the safe default.
  const fallbackVariables =
    fieldConfig?.variables && fieldConfig.variables.length > 0
      ? fieldConfig.variables
      : [...ALL_VARIABLES];

  // Figma file key — read from raw Airtable record
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

  // ── 1b. Fetch client record for variable labels ────────────────────────────
  const variableLabels: Record<string, string> = {};
  try {
    const clients = await fetchAllClients();
    const clientRecord = clients.find(
      (c) => c.name === campaign.clientName
    );
    if (clientRecord?.clientVariables && clientRecord.clientVariables.length > 0) {
      for (const cv of clientRecord.clientVariables) {
        variableLabels[cv.slot] = cv.label;
      }
    }
  } catch {
    // Non-fatal — proceed without custom labels
  }

  // ── 2. Fetch all banners ────────────────────────────────────────────────────
  const allBanners = await fetchBanners(BASE_ID, campaign.name, undefined, true);

  const standardBanners = allBanners.filter((b) => b.bannerType === "Standard");
  const carouselBanners = allBanners.filter((b) => b.bannerType === "Carousel");
  const slideBanners = allBanners.filter((b) => b.bannerType === "Slide");

  // ── 3. Build frames array ───────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const frames: any[] = [];

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
      figmaFrame: normaliseFigmaFrame(banner.figmaFrame, campaign.name),
      width: banner.width,
      height: banner.height,
      type: "Standard",
      language,
      copy,
      activeVariables,
      isVideo: banner.isVideo || false,
      animationTemplateId: banner.animationTemplateId || "",
      videoUrl: banner.videoUrl || "",
    });
  }

  for (const carousel of carouselBanners) {
    const activeVariables = getActiveVariables(
      carousel.formatName,
      formatConfigs,
      fallbackVariables
    );
    const language = carousel.language || "ET";

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
      figmaFrame: normaliseFigmaFrame(carousel.figmaFrame, campaign.name),
      width: carousel.width,
      height: carousel.height,
      type: "Carousel",
      language,
      slideCount: childSlides.length,
      copy: extractCopy(carousel, language, activeVariables),
      activeVariables,
      slides: slidesPayload,
      isVideo: carousel.isVideo || false,
      animationTemplateId: carousel.animationTemplateId || "",
      videoUrl: carousel.videoUrl || "",
    });
  }

  // ── 4. Update Last_Figma_Sync on campaign ───────────────────────────────────
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

  // ── 5. Return payload ───────────────────────────────────────────────────────
  return NextResponse.json(
    {
      fileKey: figmaCampaignFile,
      campaignId,
      campaignName: campaign.name,
      syncedAt: now,
      frameCount: frames.length,
      variableLabels,
      frames,
    },
    { headers: CORS_HEADERS }
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    return await handleSync(params.id);
  } catch (err) {
    console.error("GET /api/campaigns/[id]/figma-sync error:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

// Keep POST for backward compat (FigmaIntegrationPanel uses it)
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    return await handleSync(params.id);
  } catch (err) {
    console.error("POST /api/campaigns/[id]/figma-sync error:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
