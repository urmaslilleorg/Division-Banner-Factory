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

interface ExportToMenteMessage {
  type: "EXPORT_TO_MENTE";
}

interface ExportVideoMessage {
  type: "EXPORT_VIDEO";
  frames: Array<{
    recordId: string;
    name: string;
    figmaFrame: string;
    width: number;
    height: number;
    animationTemplateId: string;
    videoUrl: string;
    copy: Record<string, string>;
    activeVariables: string[];
  }>;
  campaignName: string;
}

interface CheckCopyStatusMessage {
  type: "CHECK_COPY_STATUS";
  campaignName: string;
  frames: FramePayload[];
}

/** Sent from UI thread back to main thread with fetched image bytes */
interface ImageDataMessage {
  type: "IMAGE_DATA";
  requestId: string;
  base64: string | null; // null = fetch failed
}

type PluginMessage = ApplyCopyMessage | ResizeMessage | CloseMessage | ExportToMenteMessage | CheckCopyStatusMessage | ExportVideoMessage | ImageDataMessage;

// ── Image fetch bridge ────────────────────────────────────────────────────────
// Figma main thread has no network access. We ask the UI iframe to fetch the
// image bytes and send them back as base64 via IMAGE_DATA message.

let _fetchImageCounter = 0;
const _pendingImageFetches = new Map<string, (base64: string | null) => void>();

/**
 * Request the UI thread to fetch an image URL and return the bytes as base64.
 * Resolves with the base64 string, or null if the fetch failed.
 */
function fetchImageViaUI(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const requestId = `img_${++_fetchImageCounter}`;
    _pendingImageFetches.set(requestId, resolve);
    figma.ui.postMessage({ type: "FETCH_IMAGE", requestId, url });
  });
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Vertical Y positions for each text slot inside a newly created frame. */
const SLOT_Y: Record<string, number> = {
  H1: 40,
  H2: 100,
  H3: 160,
  CTA: 220,
  PRICE_TAG: 280,
  ILLUSTRATION: 340,
  IMAGE: 400,
};

/** Font size for each slot. */
const SLOT_SIZE: Record<string, number> = {
  H1: 32,
  H2: 24,
  H3: 18,
  CTA: 20,
  PRICE_TAG: 24,
  ILLUSTRATION: 16,
  IMAGE: 16,
};

/** Font style for each slot. */
const SLOT_STYLE: Record<string, string> = {
  H1: "Bold",
  H2: "Regular",
  H3: "Regular",
  CTA: "Bold",
  PRICE_TAG: "Bold",
  ILLUSTRATION: "Italic",
  IMAGE: "Italic",
};

/** Slots that should be placed as image fills (not text layers) when value is a URL or data URL. */
const IMAGE_SLOTS = new Set(["Illustration", "Image"]);
/** Gap between carousel slides placed horizontally. */
const SLIDE_GAP = 100;

// ── Plugin entry ───────────────────────────────────────────────────────────────

figma.showUI(__html__, { width: 420, height: 580, title: "Division Banner Factory" });

// Send READY with any saved preferences
(async () => {
  const clientId   = await figma.clientStorage.getAsync("dbf_clientId").catch(() => undefined);
  const campaignId = await figma.clientStorage.getAsync("dbf_campaignId").catch(() => undefined);
  const month      = await figma.clientStorage.getAsync("dbf_month").catch(() => undefined);
  figma.ui.postMessage({ type: "READY", savedClientId: clientId, savedCampaignId: campaignId, savedMonth: month });
})();

figma.ui.onmessage = async (msg: PluginMessage) => {
  // ── IMAGE_DATA: resolve a pending fetchImageViaUI() promise ─────────────────
  if (msg.type === "IMAGE_DATA") {
    const resolve = _pendingImageFetches.get(msg.requestId);
    if (resolve) {
      _pendingImageFetches.delete(msg.requestId);
      resolve(msg.base64);
    }
    return;
  }

  if (msg.type === "RESIZE") {
    figma.ui.resize(msg.width, msg.height);
    return;
  }

  if (msg.type === "CLOSE") {
    figma.closePlugin();
    return;
  }

  if (msg.type === "SAVE_PREFS") {
    const { clientId, campaignId, month } = msg as unknown as { type: string; clientId?: string; campaignId?: string; month?: string };
    if (clientId !== undefined)   await figma.clientStorage.setAsync("dbf_clientId",   clientId).catch(() => {});
    if (campaignId !== undefined) await figma.clientStorage.setAsync("dbf_campaignId", campaignId).catch(() => {});
    if (month !== undefined)      await figma.clientStorage.setAsync("dbf_month",      month).catch(() => {});
    return;
  }

  if (msg.type === "APPLY_COPY") {
    const { campaignName, frames } = msg;
    let applied = 0;
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    try {
      // ── STEP 0: Ensure campaign page exists and switch to it ────────────────
      // Use a local `page` variable for ALL subsequent operations so we are
      // always guaranteed to be working on the correct page, regardless of
      // any async timing around figma.currentPage.
      let page = figma.root.children.find(
        (p) => p.type === "PAGE" && p.name === campaignName
      ) as PageNode | undefined;

      if (!page) {
        page = figma.createPage();
        page.name = campaignName;
      }

      // Switch current page synchronously, then await fonts.
      // All frame creation and findOne calls below use `page` directly.
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
            // ── CAROUSEL: only slide frames, no parent ────────────────────
            for (const slide of frameData.slides) {
              const slideFrameName = `${frameData.figmaFrame}_Slide_${slide.index}`;

              // Search ONLY on the campaign page using the local `page` var
              let existingSlide = page.findOne(
                (n) => n.type === "FRAME" && n.name === slideFrameName
              ) as FrameNode | null;

              // Backward compat: also check for old _MASTER_ naming
              if (!existingSlide) {
                // Derive old name: strip campaign prefix, add _MASTER_
                // New: CampaignName_Channel_FormatName_WxH_Slide_N
                // Old: _MASTER_Channel_FormatName_WxH_Slide_N
                const oldSlideFrameName = deriveOldMasterName(slideFrameName);
                if (oldSlideFrameName) {
                  existingSlide = page.findOne(
                    (n) => n.type === "FRAME" && n.name === oldSlideFrameName
                  ) as FrameNode | null;
                  if (existingSlide) {
                    // Rename to new naming
                    existingSlide.name = slideFrameName;
                  }
                }
              }

              if (existingSlide) {
                // Smart merge: update text layers only, preserve design
                await applyCopyToFrame(existingSlide, slide.copy, slide.activeVariables);
                updated++;
                applied++;
              } else {
                const slideFrame = await createSlideFrame(
                  slideFrameName, frameData.width || 800, frameData.height || 600,
                  slide.copy, slide.activeVariables
                );
                // Explicitly append to the campaign page
                page.appendChild(slideFrame);
                newFrames.push(slideFrame);
                created++;
                applied++;
              }
            }
          } else {
            // ── STANDARD: single frame ────────────────────────────────────
            // Search ONLY on the campaign page using the local `page` var
            let existing = page.findOne(
              (n) => n.type === "FRAME" && n.name === frameData.figmaFrame
            ) as FrameNode | null;

            // Backward compat: also check for old _MASTER_ naming
            if (!existing) {
              const oldFrameName = deriveOldMasterName(frameData.figmaFrame);
              if (oldFrameName) {
                existing = page.findOne(
                  (n) => n.type === "FRAME" && n.name === oldFrameName
                ) as FrameNode | null;
                if (existing) {
                  // Rename to new naming
                  existing.name = frameData.figmaFrame;
                }
              }
            }

            if (existing) {
              // Smart merge: update text layers only, preserve design
              await applyCopyToFrame(existing, frameData.copy, frameData.activeVariables);
              updated++;
              applied++;
            } else {
              const newFrame = await createStandardFrame(frameData);
              // Explicitly append to the campaign page
              page.appendChild(newFrame);
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

  // ── CHECK_COPY_STATUS: Compare Airtable copy against current Figma text layers ──
  if (msg.type === "CHECK_COPY_STATUS") {
    const { campaignName, frames } = msg;

    // Find the campaign page (may not exist yet)
    const page = figma.root.children.find(
      (p) => p.type === "PAGE" && p.name === campaignName
    ) as PageNode | undefined;

    type FrameStatus = "UP_TO_DATE" | "UPDATED" | "NEW";
    const results: { name: string; status: FrameStatus; changedFields: string[] }[] = [];

    for (const frameData of frames) {
      if (frameData.type === "Carousel" && frameData.slides) {
        // ── Carousel: check each slide individually ──────────────────────────
        for (const slide of frameData.slides) {
          const slideName = `${frameData.figmaFrame}_Slide_${slide.index}`;
          const oldSlideName = deriveOldMasterName(slideName);

          const existing = page
            ? (page.findOne((n) => n.type === "FRAME" && (n.name === slideName || (!!oldSlideName && n.name === oldSlideName))) as FrameNode | null)
            : null;

          if (!existing) {
            results.push({ name: slideName, status: "NEW", changedFields: [] });
            continue;
          }

          const changedFields = compareFrameCopy(existing, slide.copy, slide.activeVariables);
          results.push({
            name: slideName,
            status: changedFields.length > 0 ? "UPDATED" : "UP_TO_DATE",
            changedFields,
          });
        }
      } else {
        // ── Standard frame ───────────────────────────────────────────────────
        const oldName = deriveOldMasterName(frameData.figmaFrame);
        const existing = page
          ? (page.findOne((n) => n.type === "FRAME" && (n.name === frameData.figmaFrame || (!!oldName && n.name === oldName))) as FrameNode | null)
          : null;

        if (!existing) {
          results.push({ name: frameData.figmaFrame, status: "NEW", changedFields: [] });
          continue;
        }

        const changedFields = compareFrameCopy(existing, frameData.copy, frameData.activeVariables);
        results.push({
          name: frameData.figmaFrame,
          status: changedFields.length > 0 ? "UPDATED" : "UP_TO_DATE",
          changedFields,
        });
      }
    }

    figma.ui.postMessage({ type: "COPY_STATUS", frames: results });
    return;
  }

  // ── EXPORT_VIDEO: Export video frame layers for server-side rendering ──────────
  if (msg.type === "EXPORT_VIDEO") {
    const { frames: videoFrames, campaignName: vidCampaignName } = msg;

    // Find the campaign page
    const vidPage = figma.root.children.find(
      (p) => p.type === "PAGE" && p.name === vidCampaignName
    ) as PageNode | undefined;

    if (!vidPage) {
      figma.ui.postMessage({
        type: "VIDEO_EXPORT_ERROR",
        message: `Campaign page "${vidCampaignName}" not found. Apply copy first.`,
      });
      return;
    }

    const results: Array<{
      recordId: string;
      frameName: string;
      animationTemplateId: string;
      width: number;
      height: number;
      layers: Array<{ name: string; type: string; x: number; y: number; w: number; h: number; text?: string; imageBase64?: string; fontSize?: number; fontStyle?: string; fills?: Array<{ type: string; r?: number; g?: number; b?: number; a?: number }> }>;
    }> = [];

    for (let i = 0; i < videoFrames.length; i++) {
      const vf = videoFrames[i];

      figma.ui.postMessage({
        type: "VIDEO_EXPORT_PROGRESS",
        current: i + 1,
        total: videoFrames.length,
        frameName: vf.figmaFrame,
      });

      // Find the frame on the page
      const frame = vidPage.findOne(
        (n) => n.type === "FRAME" && (n.name === vf.figmaFrame || n.name === deriveOldMasterName(vf.figmaFrame))
      ) as FrameNode | null;

      if (!frame) {
        figma.ui.postMessage({
          type: "VIDEO_EXPORT_FRAME_ERROR",
          frameName: vf.figmaFrame,
          error: "Frame not found on page",
        });
        continue;
      }

      // Extract all layers from the frame
      const layers: typeof results[0]["layers"] = [];

      const allNodes = frame.findAll(() => true);
      for (const node of allNodes) {
        if (node.type === "TEXT") {
          const textNode = node as TextNode;
          layers.push({
            name: textNode.name,
            type: "TEXT",
            x: textNode.x,
            y: textNode.y,
            w: textNode.width,
            h: textNode.height,
            text: textNode.characters,
            fontSize: typeof textNode.fontSize === "number" ? textNode.fontSize : 16,
            fontStyle: typeof textNode.fontName !== "symbol" ? (textNode.fontName as FontName).style : "Regular",
          });
        } else if (node.type === "RECTANGLE") {
          const rectNode = node as RectangleNode;
          const imageFill = rectNode.fills !== figma.mixed
            ? (rectNode.fills as readonly Paint[]).find((f) => f.type === "IMAGE") as ImagePaint | undefined
            : undefined;

          let imageBase64: string | undefined;
          if (imageFill?.imageHash) {
            try {
              const img = figma.getImageByHash(imageFill.imageHash);
              if (img) {
                const bytes = await img.getBytesAsync();
                imageBase64 = figma.base64Encode(bytes);
              }
            } catch { /* non-fatal */ }
          }

          const solidFills = rectNode.fills !== figma.mixed
            ? (rectNode.fills as readonly Paint[])
                .filter((f) => f.type === "SOLID")
                .map((f) => { const sf = f as SolidPaint; return { type: "SOLID", r: sf.color.r, g: sf.color.g, b: sf.color.b, a: sf.opacity ?? 1 }; })
            : [];

          layers.push({
            name: rectNode.name,
            type: "RECTANGLE",
            x: rectNode.x,
            y: rectNode.y,
            w: rectNode.width,
            h: rectNode.height,
            imageBase64,
            fills: solidFills,
          });
        } else if (node.type === "FRAME" || node.type === "GROUP") {
          // Export nested frames/groups as PNG
          try {
            const pngBytes = await (node as FrameNode).exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
            layers.push({
              name: node.name,
              type: "IMAGE",
              x: (node as FrameNode).x,
              y: (node as FrameNode).y,
              w: (node as FrameNode).width,
              h: (node as FrameNode).height,
              imageBase64: figma.base64Encode(pngBytes),
            });
          } catch { /* non-fatal */ }
        }
      }

      results.push({
        recordId: vf.recordId,
        frameName: vf.figmaFrame,
        animationTemplateId: vf.animationTemplateId,
        width: frame.width,
        height: frame.height,
        layers,
      });
    }

    figma.ui.postMessage({
      type: "VIDEO_EXPORT_DONE",
      frames: results,
    });
    return;
  }

  // ── EXPORT: Export campaign frames as PNG and send to UI for upload ──────────
  if (msg.type === "EXPORT_TO_MENTE") {
    const page = figma.currentPage;

    // 1. Determine frames to export
    // Include frames that match new naming (no _MASTER_ prefix) AND old _MASTER_ naming
    const isExportableFrame = (n: SceneNode) =>
      n.type === "FRAME" && !n.name.startsWith("__label__");

    const selected = figma.currentPage.selection
      .filter(isExportableFrame) as FrameNode[];

    const framesToExport: FrameNode[] = selected.length > 0
      ? selected
      : (page.children.filter(isExportableFrame) as FrameNode[]);

    if (framesToExport.length === 0) {
      figma.ui.postMessage({
        type: "EXPORT_ERROR",
        message: "No frames found on this page. Run Fetch + Apply first.",
      });
      return;
    }

    // 2. Export each frame
    for (let i = 0; i < framesToExport.length; i++) {
      const frame = framesToExport[i];

      figma.ui.postMessage({
        type: "EXPORT_PROGRESS",
        current: i + 1,
        total: framesToExport.length,
        frameName: frame.name,
      });

      try {
        const pngBytes = await frame.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: 1 },
        });

        const base64 = figma.base64Encode(pngBytes);

        figma.ui.postMessage({
          type: "FRAME_EXPORTED",
          frameName: frame.name,
          base64,
          width: frame.width,
          height: frame.height,
        });
      } catch (err) {
        figma.ui.postMessage({
          type: "FRAME_EXPORT_ERROR",
          frameName: frame.name,
          error: String(err),
        });
      }
    }

    figma.ui.postMessage({
      type: "EXPORT_DONE",
      exported: framesToExport.length,
    });
    return;
  }
};

// ── Selection change listener ─────────────────────────────────────────────────
figma.on("selectionchange", () => {
  const selected = figma.currentPage.selection
    .filter((n) => n.type === "FRAME" && !n.name.startsWith("__label__"));
  figma.ui.postMessage({
    type: "SELECTION_CHANGED",
    count: selected.length,
  });
});


// ── Backward-compat helpers ──────────────────────────────────────────────────

/**
 * Given a new-style frame name (CampaignName_Channel_FormatName_WxH[_Slide_N]),
 * derive the equivalent old _MASTER_ name by stripping the first underscore-
 * separated token (campaign name) and prepending _MASTER_.
 *
 * Returns null if the name already starts with _MASTER_ or cannot be parsed.
 *
 * Example:
 *   "Avene_Spring2026_Google_Display_Horizontal_1200x628"
 *   → "_MASTER_Google_Display_Horizontal_1200x628"
 */
function deriveOldMasterName(newName: string): string | null {
  if (newName.startsWith("_MASTER_")) return null; // already old naming
  const underscoreIdx = newName.indexOf("_");
  if (underscoreIdx < 0) return null;
  const withoutCampaign = newName.slice(underscoreIdx + 1);
  return `_MASTER_${withoutCampaign}`;
}

/**
 * Compare Airtable copy values against the current text/image layers in a Figma frame.
 * Returns the list of slot names that differ (changed or missing in Figma).
 *
 * For text slots: compares textNode.characters against copy[slot].
 * For image slots (Image, Illustration): if copy has a URL but the rect has no
 *   IMAGE fill (or has a solid grey placeholder fill), it's considered changed.
 */
function compareFrameCopy(
  frame: FrameNode,
  copy: Record<string, string>,
  activeVariables: string[]
): string[] {
  const changed: string[] = [];

  // Build a map of text layer name → characters
  const textMap = new Map<string, string>();
  const textNodes = frame.findAll((n) => n.type === "TEXT") as TextNode[];
  for (const node of textNodes) {
    textMap.set(node.name.toUpperCase().replace(/\s+/g, "_"), node.characters);
  }

  // Build a map of rect name → has real image fill
  const rectImageMap = new Map<string, boolean>();
  const rectNodes = frame.findAll((n) => n.type === "RECTANGLE") as RectangleNode[];
  for (const rect of rectNodes) {
    const key = rect.name.toUpperCase().replace(/\s+/g, "_");
    const hasImageFill = rect.fills !== figma.mixed &&
      (rect.fills as readonly Paint[]).some((f) => f.type === "IMAGE");
    rectImageMap.set(key, hasImageFill);
  }

  for (const slot of activeVariables) {
    const slotKey = slot.toUpperCase().replace(/\s+/g, "_");
    const copyValue = copy[slot] ?? "";

    if (IMAGE_SLOTS.has(slot)) {
      // Image slot: check if a rect with an IMAGE fill exists
      const hasImageFill = rectImageMap.get(slotKey) ?? false;
      const hasUrl = copyValue.startsWith("http") || copyValue.startsWith("data:image");
      if (hasUrl && !hasImageFill) {
        changed.push(slot);
      }
      // If copy is empty and there's no rect, that's fine — no change
    } else {
      // Text slot
      const figmaText = textMap.get(slotKey);
      if (figmaText === undefined) {
        // Layer doesn't exist in Figma yet — only flag if copy is non-empty
        if (copyValue.trim() !== "") changed.push(slot);
      } else if (figmaText !== copyValue) {
        changed.push(slot);
      }
    }
  }

  return changed;
}

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
 * Add nodes to a frame for each active variable slot.
 * Image/Illustration slots with a URL value → image fill rectangle.
 * All other slots (or text values for image slots) → text node.
 * Positions are fixed per slot (see SLOT_Y).
 */
async function addTextLayers(
  frame: FrameNode,
  copy: Record<string, string>,
  activeVariables: string[]
): Promise<void> {
  for (const slot of activeVariables) {
    const slotKey = slot.toUpperCase().replace(/\s+/g, "_");
    const value = copy[slot] ?? "";
    const y = SLOT_Y[slotKey] ?? 40 + activeVariables.indexOf(slot) * 60;

    // Determine whether this slot should be placed as an image
    const isImageSlot = IMAGE_SLOTS.has(slot);
    const isUrl = value.startsWith("http") || value.startsWith("data:image");

    if (isImageSlot && isUrl && value.trim() !== "") {
      // ── Image fill rectangle (URL present) ───────────────────────────────
      await placeImageInFrame(frame, slot, value, y);
    } else if (isImageSlot) {
      // ── Grey placeholder rectangle (IMAGE_SLOT but no URL yet) ───────────
      // Never create a text node for image slots — use a grey rectangle
      // with a label so the designer can see where the image will go.
      const rect = figma.createRectangle();
      rect.name = slot;
      rect.x = 40;
      rect.y = y;
      rect.resize(200, 200);
      rect.fills = [{ type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 } }];
      frame.appendChild(rect);
      try {
        const label = figma.createText();
        label.name = `${slot}_placeholder_label`;
        label.fontName = { family: "Inter", style: "Regular" };
        label.fontSize = 12;
        label.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
        label.characters = `[${slot}]`;
        label.x = 40 + 8;
        label.y = y + 8;
        frame.appendChild(label);
      } catch { /* non-fatal */ }
    } else {
      // ── Text node (non-image slot) ────────────────────────────────────────
      const displayValue = value.trim() !== "" ? value : `[${slot}]`;
      const textNode = figma.createText();
      textNode.name = slot;

      const style = SLOT_STYLE[slotKey] ?? "Regular";
      const size = SLOT_SIZE[slotKey] ?? 16;
      textNode.fontName = { family: "Inter", style };
      textNode.fontSize = size;
      textNode.characters = displayValue;
      textNode.x = 40;
      textNode.y = y;

      frame.appendChild(textNode);
    }
  }
}

/**
 * Fetch an image from a URL (http/https or data URL) and place it as a
 * rectangle with an IMAGE fill inside the given frame.
 *
 * Remote URLs are fetched via the UI thread (fetchImageViaUI) because the
 * Figma main thread has no network access. Data URLs are decoded locally.
 *
 * Falls back to a grey placeholder rectangle if the fetch fails.
 */
async function placeImageInFrame(
  frame: FrameNode,
  slotName: string,
  url: string,
  y: number
): Promise<void> {
  const rect = figma.createRectangle();
  rect.name = slotName;
  rect.x = 40;
  rect.y = y;
  rect.resize(200, 200);

  try {
    let imageData: Uint8Array;

    if (url.startsWith("data:image")) {
      // Data URL — decode base64 payload directly in main thread
      const base64 = url.split(",")[1];
      const binary = atob(base64);
      imageData = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        imageData[i] = binary.charCodeAt(i);
      }
    } else {
      // Remote URL — delegate fetch to UI thread (main thread has no network)
      const base64 = await fetchImageViaUI(url);
      if (!base64) throw new Error("UI fetch returned null");
      const binary = atob(base64);
      imageData = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        imageData[i] = binary.charCodeAt(i);
      }
    }

    const image = figma.createImage(imageData);
    rect.fills = [{
      type: "IMAGE",
      imageHash: image.hash,
      scaleMode: "FIT",
    }];
  } catch {
    // Fallback: grey placeholder with label text
    rect.fills = [{ type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 } }];
    try {
      const label = figma.createText();
      label.name = `${slotName}_placeholder_label`;
      label.fontName = { family: "Inter", style: "Regular" };
      label.fontSize = 12;
      label.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
      label.characters = `[${slotName}]`;
      label.x = 40 + 8;
      label.y = y + 8;
      frame.appendChild(label);
    } catch { /* non-fatal */ }
  }

  frame.appendChild(rect);
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

  // ── Image / Illustration fills on existing rectangle layers ──────────────
  // If the frame has a RECTANGLE named "Image" or "Illustration" and the
  // corresponding copy value is a URL/data URL, update its image fill.
  const rectNodes = frame.findAll((n) => n.type === "RECTANGLE") as RectangleNode[];
  for (const rect of rectNodes) {
    const matchingSlot = activeVariables.find(
      (slot) => IMAGE_SLOTS.has(slot) && slot.toUpperCase().replace(/\s+/g, "_") === rect.name.toUpperCase().replace(/\s+/g, "_")
    );
    if (!matchingSlot) continue;
    const url = copy[matchingSlot];
    if (!url || url.trim() === "") continue;
    const isUrl = url.startsWith("http") || url.startsWith("data:image");
    if (!isUrl) continue;

    try {
      let imageData: Uint8Array;
      if (url.startsWith("data:image")) {
        const base64 = url.split(",")[1];
        const binary = atob(base64);
        imageData = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) imageData[i] = binary.charCodeAt(i);
      } else {
        // Remote URL — delegate to UI thread (main thread has no network access)
        const base64 = await fetchImageViaUI(url);
        if (!base64) throw new Error("UI fetch returned null");
        const binary = atob(base64);
        imageData = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) imageData[i] = binary.charCodeAt(i);
      }
      const image = figma.createImage(imageData);
      rect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FIT" }];
    } catch { /* non-fatal — keep existing fill */ }
  }
}
