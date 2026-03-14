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

/** Grid gap between auto-created frames (px). */


// ── Plugin entry ──────────────────────────────────────────────────────────────

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

      // ── STEP 1: Process each frame in the payload ────────────────────────────
      for (let i = 0; i < frames.length; i++) {
        const frameData = frames[i];

        figma.ui.postMessage({
          type: "PROGRESS",
          current: i + 1,
          total: frames.length,
          frameName: frameData.figmaFrame,
        });

        try {
          const existing = figma.currentPage.findOne(
            (n) => n.type === "FRAME" && n.name === frameData.figmaFrame
          ) as FrameNode | null;

          if (existing) {
            // ── UPDATE: only touch text layers ────────────────────────────────
            if (frameData.type === "Standard") {
              await applyCopyToFrame(existing, frameData.copy, frameData.activeVariables);
            } else if (frameData.type === "Carousel" && frameData.slides) {
              for (const slide of frameData.slides) {
                const slideFrameName = `${frameData.figmaFrame}_Slide_${slide.index}`;
                const slideFrame = existing.findOne(
                  (n) => n.type === "FRAME" && n.name === slideFrameName
                ) as FrameNode | null;
                if (slideFrame) {
                  await applyCopyToFrame(slideFrame, slide.copy, slide.activeVariables);
                } else {
                  await applyCopyToFrame(existing, frameData.copy, frameData.activeVariables);
                  break;
                }
              }
            }
            updated++;
            applied++;
          } else {
            // ── CREATE: build frame + text layers from scratch ─────────────────
            const newFrame = await createFrameFromPayload(frameData);
            newFrames.push(newFrame);
            created++;
            applied++;
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

// ── Frame creation ────────────────────────────────────────────────────────────

/**
 * Create a top-level frame (and its text layers) from a FramePayload.
 * For Carousel frames, also creates slide sub-frames.
 */
async function createFrameFromPayload(frameData: FramePayload): Promise<FrameNode> {
  const frame = figma.createFrame();
  frame.name = frameData.figmaFrame;
  frame.resize(frameData.width || 800, frameData.height || 600);
  frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];

  if (frameData.type === "Standard") {
    await addTextLayers(frame, frameData.copy, frameData.activeVariables);
  } else if (frameData.type === "Carousel" && frameData.slides) {
    // Create a sub-frame for each slide, positioned side by side
    let slideX = 0;
    for (const slide of frameData.slides) {
      const slideFrame = figma.createFrame();
      slideFrame.name = `${frameData.figmaFrame}_Slide_${slide.index}`;
      slideFrame.resize(frameData.width || 800, frameData.height || 600);
      slideFrame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      slideFrame.x = slideX;
      slideFrame.y = 0;
      slideX += (frameData.width || 800) + GRID_GAP;

      await addTextLayers(slideFrame, slide.copy, slide.activeVariables);
      frame.appendChild(slideFrame);
    }
    // Expand parent to contain all slides
    frame.resize(slideX - GRID_GAP, frameData.height || 600);
  }

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

/** Gap between frames in the vertical stack. */
const GRID_Y_GAP = 200;
/** Space reserved above each frame for the label. */
const LABEL_CLEARANCE = 40;

/**
 * Arrange frames in a vertical stack (one below the other).
 * - All frames aligned to x = 0
 * - 200 px gap between frames
 * - A grey label (name + dimensions) sits 40 px above each frame
 * - Frames sorted by height descending so tallest are at the top
 */
function layoutFramesInGrid(frames: FrameNode[]): void {
  // Sort tallest first — gives a natural "biggest banner first" reading order
  const sorted = [...frames].sort((a, b) => b.height - a.height);

  let y = 0;

  for (const frame of sorted) {
    // Place label above the frame
    addFrameLabel(frame, 0, y);

    // Place frame below the label
    frame.x = 0;
    frame.y = y + LABEL_CLEARANCE;

    // Advance y cursor
    y += LABEL_CLEARANCE + frame.height + GRID_Y_GAP;
  }
}

/**
 * Add a grey label text node above a frame.
 * Label text: "<frameName>  <width>×<height>"
 * Position: (frameX, labelY) — 30 px above the frame.
 */
function addFrameLabel(frame: FrameNode, frameX: number, labelY: number): void {
  try {
    const label = figma.createText();
    label.name = `__label__${frame.name}`;
    label.fontName = { family: "Inter", style: "Regular" };
    label.fontSize = 16;
    label.fills = [{ type: "SOLID", color: { r: 0.6, g: 0.6, b: 0.6 } }];
    label.characters = `${frame.name}  ${frame.width}\u00d7${frame.height}`;
    label.x = frameX;
    label.y = labelY;
    // Place label on the same parent as the frame (current page)
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
