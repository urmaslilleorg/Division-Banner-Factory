/// <reference types="@figma/plugin-typings" />

/**
 * Division Banner Factory — Figma Plugin (main thread)
 *
 * Message protocol (UI → plugin):
 *   { type: "APPLY_COPY", campaignName: string, frames: FramePayload[] }
 *   { type: "RESIZE",     width: number, height: number }
 *   { type: "CLOSE" }
 *
 * Message protocol (plugin → UI):
 *   { type: "READY" }
 *   { type: "PROGRESS", current: number, total: number, frameName: string }
 *   { type: "DONE",     applied: number, created: number, updated: number, errors: string[] }
 *   { type: "ERROR",    message: string }
 *
 * Apply flow:
 *   STEP 0 — Ensure a page named <campaignName> exists (create if missing, switch to it).
 *   STEP 1 — For each frame in the payload:
 *              • If frame exists on the page → UPDATE text layers only.
 *              • If frame is missing         → CREATE frame + text layers from scratch.
 *   STEP 2 — Lay out newly created frames in a grid (100 px gaps).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface SlideCopyPayload {
  index: number;
  copy: Record<string, string>;
  activeVariables: string[];
}

interface FramePayload {
  recordId: string;
  name: string;
  figmaFrame: string;
  width: number;
  height: number;
  type: "Standard" | "Carousel";
  copy: Record<string, string>;
  activeVariables: string[];
  slides?: SlideCopyPayload[];
}

interface ApplyCopyMessage {
  type: "APPLY_COPY";
  campaignName: string;
  frames: FramePayload[];
}

interface ResizeMessage {
  type: "RESIZE";
  width: number;
  height: number;
}

interface CloseMessage {
  type: "CLOSE";
}

type PluginMessage = ApplyCopyMessage | ResizeMessage | CloseMessage;

// ── Constants ─────────────────────────────────────────────────────────────────

/** Vertical Y positions for each text slot inside a newly created frame. */
const SLOT_Y: Record<string, number> = {
  H1: 40,
  H2: 100,
  H3: 160,
  CTA: 220,
  PRICE_TAG: 280,
  ILLUSTRATION: 340,
};

/** Font size for each slot. */
const SLOT_SIZE: Record<string, number> = {
  H1: 32,
  H2: 24,
  H3: 18,
  CTA: 20,
  PRICE_TAG: 24,
  ILLUSTRATION: 16,
};

/** Font style for each slot. */
const SLOT_STYLE: Record<string, string> = {
  H1: "Bold",
  H2: "Regular",
  H3: "Regular",
  CTA: "Bold",
  PRICE_TAG: "Bold",
  ILLUSTRATION: "Italic",
};
/** Gap between carousel slides placed horizontally. */
const SLIDE_GAP = 100;

// ── Plugin entry ───────────────────────────────────────────────────────────────

figma.showUI(__html__, { width: 420, height: 580, title: "Division Banner Factory" });

// Send READY with any saved preferences
(async () => {
  const clientId  = await figma.clientStorage.getAsync("dbf_clientId").catch(() => undefined);
  const campaignId = await figma.clientStorage.getAsync("dbf_campaignId").catch(() => undefined);
  figma.ui.postMessage({ type: "READY", savedClientId: clientId, savedCampaignId: campaignId });
})();

figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === "RESIZE") {
    figma.ui.resize(msg.width, msg.height);
    return;
  }

  if (msg.type === "CLOSE") {
    figma.closePlugin();
    return;
  }

  if (msg.type === "SAVE_PREFS") {
    const { clientId, campaignId } = msg as unknown as { type: string; clientId?: string; campaignId?: string };
    if (clientId !== undefined)  await figma.clientStorage.setAsync("dbf_clientId",  clientId).catch(() => {});
    if (campaignId !== undefined) await figma.clientStorage.setAsync("dbf_campaignId", campaignId).catch(() => {});
    return;
  }

  if (msg.type === "APPLY_COPY") {
    const { campaignName, frames } = msg;
    let applied = 0;
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    try {
      // ── STEP 0: Ensure campaign page exists ──────────────────────────────────
      let page = figma.root.children.find(
        (p) => p.type === "PAGE" && p.name === campaignName
      ) as PageNode | undefined;

      if (!page) {
        page = figma.createPage();
        page.name = campaignName;
      }

      figma.currentPage = page;

      // Pre-load fonts once before any frame creation
      await loadRequiredFonts();

      // Track newly created frames so we can grid-lay them out at the end
      const newFrames: FrameNode[] = [];

      // ── STEP 1: Process each frame in the payload ────────────────────────
      for (let i = 0; i < frames.length; i++) {
        const frameData = frames[i];

        figma.ui.postMessage({
          type: "PROGRESS",
          current: i + 1,
          total: frames.length,
          frameName: frameData.figmaFrame,
        });

        try {
          if (frameData.type === "Carousel" && frameData.slides) {
            // ── CAROUSEL: work with individual slide frames, no parent ────────
            let anyCreated = false;
            for (const slide of frameData.slides) {
              const slideFrameName = `${frameData.figmaFrame}_Slide_${slide.index}`;
              const existingSlide = figma.currentPage.findOne(
                (n) => n.type === "FRAME" && n.name === slideFrameName
              ) as FrameNode | null;

              if (existingSlide) {
                await applyCopyToFrame(existingSlide, slide.copy, slide.activeVariables);
                updated++;
                applied++;
              } else {
                const slideFrame = await createSlideFrame(
                  slideFrameName, frameData.width || 800, frameData.height || 600,
                  slide.copy, slide.activeVariables
                );
                // Tag first slide with carousel metadata for layout
                if (slide.index === 1) {
                  slideFrame.setPluginData("carouselLabel",
                    `${frameData.figmaFrame}  ${frameData.width || 800}\u00d7${frameData.height || 600} (${frameData.slides!.length} slides)`);
                  slideFrame.setPluginData("isCarouselFirst", "true");
                }
                newFrames.push(slideFrame);
                anyCreated = true;
                created++;
                applied++;
              }
            }
          } else {
            // ── STANDARD: single frame ────────────────────────────────────────
            const existing = figma.currentPage.findOne(
              (n) => n.type === "FRAME" && n.name === frameData.figmaFrame
            ) as FrameNode | null;

            if (existing) {
              await applyCopyToFrame(existing, frameData.copy, frameData.activeVariables);
              updated++;
              applied++;
            } else {
              const newFrame = await createStandardFrame(frameData);
              newFrames.push(newFrame);
              created++;
              applied++;
            }
          }
        } catch (err) {
          errors.push(`${frameData.figmaFrame}: ${String(err)}`);
        }
      }

      // ── STEP 2: Grid-layout newly created frames ─────────────────────────────
      if (newFrames.length > 0) {
        layoutFramesInGrid(newFrames);
      }
    } catch (err) {
      figma.ui.postMessage({ type: "ERROR", message: String(err) });
      return;
    }

    figma.ui.postMessage({ type: "DONE", applied, created, updated, errors });
  }
};
// ── Frame creation ───────────────────────────────────────────────────────────────

/** Create a standard (non-carousel) frame with text layers. */
async function createStandardFrame(frameData: FramePayload): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = frameData.figmaFrame;
  frame.resize(frameData.width || 800, frameData.height || 600);
  frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  await addTextLayers(frame, frameData.copy, frameData.activeVariables);
  return frame;
}

/** Create a single carousel slide frame with text layers. */
async function createSlideFrame(
  name: string,
  width: number,
  height: number,
  copy: Record<string, string>,
  activeVariables: string[]
): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = name;
  frame.resize(width, height);
  frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  await addTextLayers(frame, copy, activeVariables);
  return frame;
}

/**
 * Add text nodes to a frame for each active variable slot.
 * Positions are fixed per slot (see SLOT_Y).
 */
async function addTextLayers(
  frame: FrameNode,
  copy: Record<string, string>,
  activeVariables: string[]
): Promise<void> {
  for (const slot of activeVariables) {
    const slotKey = slot.toUpperCase().replace(/\s+/g, "_");
    const value = copy[slot] ?? `[${slot}]`;

    const textNode = figma.createText();
    textNode.name = slot;

    // Apply font properties
    const style = SLOT_STYLE[slotKey] ?? "Regular";
    const size = SLOT_SIZE[slotKey] ?? 16;
    textNode.fontName = { family: "Inter", style };
    textNode.fontSize = size;

    // Set text (must be done after fontName is set)
    textNode.characters = value;

    // Position
    textNode.x = 40;
    textNode.y = SLOT_Y[slotKey] ?? 40 + activeVariables.indexOf(slot) * 60;

    frame.appendChild(textNode);
  }
}

// ── Grid layout ───────────────────────────────────────────────────────────────

/** Vertical gap between rows. */
const GRID_Y_GAP = 200;
/** Space reserved above each frame for the label. */
const LABEL_CLEARANCE = 40;

/**
 * Arrange frames in a vertical stack.
 *
 * Standard frames: one per row, left-aligned at x=0.
 * Carousel slides: Slide_1 is tagged with isCarouselFirst=true.
 *   Slide_1 starts at x=0; subsequent slides (Slide_2, Slide_3, ...)
 *   are placed to the right of the previous slide with SLIDE_GAP.
 *   All slides in a carousel share the same Y (same row).
 *
 * A grey label sits LABEL_CLEARANCE px above each row's first frame.
 * Rows sorted tallest-first.
 */
function layoutFramesInGrid(frames: FrameNode[]): void {
  // Separate standard frames from carousel slide groups
  // Group carousel slides by their base name (everything before _Slide_)
  const carouselGroups = new Map<string, FrameNode[]>();
  const standardFrames: FrameNode[] = [];

  for (const frame of frames) {
    const slideMatch = frame.name.match(/^(.+)_Slide_(\d+)$/);
    if (slideMatch) {
      const baseName = slideMatch[1];
      if (!carouselGroups.has(baseName)) carouselGroups.set(baseName, []);
      carouselGroups.get(baseName)!.push(frame);
    } else {
      standardFrames.push(frame);
    }
  }

  // Sort carousel slides within each group by slide index
  for (const slides of carouselGroups.values()) {
    slides.sort((a, b) => {
      const ai = parseInt(a.name.match(/_Slide_(\d+)$/)![1]);
      const bi = parseInt(b.name.match(/_Slide_(\d+)$/)![1]);
      return ai - bi;
    });
  }

  // Build row entries: each entry is either a single standard frame
  // or an array of carousel slides (treated as one row)
  type RowEntry = { type: "standard"; frame: FrameNode } | { type: "carousel"; slides: FrameNode[]; baseName: string };
  const rows: RowEntry[] = [
    ...standardFrames.map(f => ({ type: "standard" as const, frame: f })),
    ...[...carouselGroups.entries()].map(([baseName, slides]) => ({ type: "carousel" as const, slides, baseName })),
  ];

  // Sort rows tallest-first (by the height of the first/only frame)
  rows.sort((a, b) => {
    const ha = a.type === "standard" ? a.frame.height : a.slides[0].height;
    const hb = b.type === "standard" ? b.frame.height : b.slides[0].height;
    return hb - ha;
  });

  let y = 0;

  for (const row of rows) {
    if (row.type === "standard") {
      const frame = row.frame;
      // Label: "FrameName  WxH"
      addFrameLabelText(`${frame.name}  ${frame.width}\u00d7${frame.height}`, 0, y);
      frame.x = 0;
      frame.y = y + LABEL_CLEARANCE;
      y += LABEL_CLEARANCE + frame.height + GRID_Y_GAP;
    } else {
      const { slides, baseName } = row;
      const w = slides[0].width;
      const h = slides[0].height;
      // Label: "BaseName  WxH (N slides)"
      addFrameLabelText(`${baseName}  ${w}\u00d7${h} (${slides.length} slides)`, 0, y);
      let slideX = 0;
      for (const slide of slides) {
        slide.x = slideX;
        slide.y = y + LABEL_CLEARANCE;
        slideX += slide.width + SLIDE_GAP;
      }
      y += LABEL_CLEARANCE + h + GRID_Y_GAP;
    }
  }
}

/**
 * Add a grey label text node at the given position.
 * @param text  Full label string, e.g. "FrameName  960×1200 (3 slides)"
 * @param x     Left edge of the label
 * @param y     Top edge of the label (should be LABEL_CLEARANCE px above the frame)
 */
function addFrameLabelText(text: string, x: number, y: number): void {
  try {
    const label = figma.createText();
    label.name = `__label__${text}`;
    label.fontName = { family: "Inter", style: "Regular" };
    label.fontSize = 16;
    label.fills = [{ type: "SOLID", color: { r: 0.6, g: 0.6, b: 0.6 } }];
    label.characters = text;
    label.x = x;
    label.y = y;
    figma.currentPage.appendChild(label);
  } catch {
    // Non-fatal — label is cosmetic only
  }
}

// ── Font loading ──────────────────────────────────────────────────────────────

/**
 * Pre-load all font variants used by the plugin.
 * Falls back gracefully — if Inter is unavailable, tries Roboto then Arial.
 */
async function loadRequiredFonts(): Promise<void> {
  const families = ["Inter", "Roboto", "Arial"];
  const styles = ["Regular", "Bold", "Italic"];

  for (const family of families) {
    let allLoaded = true;
    for (const style of styles) {
      try {
        await figma.loadFontAsync({ family, style });
      } catch {
        allLoaded = false;
      }
    }
    if (allLoaded) return; // First family that fully loads wins
  }
}

// ── Update helpers ────────────────────────────────────────────────────────────

/**
 * Apply copy values to existing text layers inside a frame.
 * Matches layers by name (case-insensitive, spaces → underscores).
 * Does NOT touch position, size, or styling — preserves designer work.
 */
async function applyCopyToFrame(
  frame: FrameNode,
  copy: Record<string, string>,
  activeVariables: string[]
): Promise<void> {
  const textNodes = frame.findAll((n) => n.type === "TEXT") as TextNode[];

  for (const textNode of textNodes) {
    const layerKey = textNode.name.toUpperCase().replace(/\s+/g, "_");

    const matchingSlot = activeVariables.find(
      (slot) => slot.toUpperCase().replace(/\s+/g, "_") === layerKey
    );
    if (!matchingSlot) continue;

    const newText = copy[matchingSlot];
    if (newText === undefined || newText === null) continue;

    // Load fonts currently used in this node before editing.
    // Guard: getRangeFontName requires end > start, so skip if node is empty.
    if (textNode.characters.length > 0) {
      const fonts = textNode.getRangeFontName(0, textNode.characters.length);
      if (typeof fonts !== "symbol") {
        await figma.loadFontAsync(fonts as FontName);
      } else {
        const seen = new Set<string>();
        for (let i = 0; i < textNode.characters.length; i++) {
          const font = textNode.getRangeFontName(i, i + 1) as FontName;
          const key = `${font.family}::${font.style}`;
          if (!seen.has(key)) {
            seen.add(key);
            await figma.loadFontAsync(font);
          }
        }
      }
    } else {
      // Empty node — load a fallback font so we can set characters
      await figma.loadFontAsync({ family: "Inter", style: "Regular" }).catch(() =>
        figma.loadFontAsync({ family: "Arial", style: "Regular" })
      );
    }

    textNode.characters = newText;
  }
}
