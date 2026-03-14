/// <reference types="@figma/plugin-typings" />

/**
 * Division Banner Factory — Figma Plugin (main thread)
 *
 * Receives messages from the UI panel and applies copy to text layers
 * inside the target frames.
 *
 * Message protocol (UI → plugin):
 *   { type: "APPLY_COPY", frames: FramePayload[] }
 *   { type: "RESIZE", width: number, height: number }
 *   { type: "CLOSE" }
 *
 * Message protocol (plugin → UI):
 *   { type: "READY" }
 *   { type: "PROGRESS", current: number, total: number, frameName: string }
 *   { type: "DONE", applied: number, skipped: number, errors: string[] }
 *   { type: "ERROR", message: string }
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
  type: "Standard" | "Carousel";
  copy: Record<string, string>;
  activeVariables: string[];
  slides?: SlideCopyPayload[];
}

interface ApplyCopyMessage {
  type: "APPLY_COPY";
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

// ── Plugin entry ──────────────────────────────────────────────────────────────

figma.showUI(__html__, { width: 420, height: 560, title: "Division Banner Factory" });
figma.ui.postMessage({ type: "READY" });

figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === "RESIZE") {
    figma.ui.resize(msg.width, msg.height);
    return;
  }

  if (msg.type === "CLOSE") {
    figma.closePlugin();
    return;
  }

  if (msg.type === "APPLY_COPY") {
    const { frames } = msg;
    let applied = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      figma.ui.postMessage({
        type: "PROGRESS",
        current: i + 1,
        total: frames.length,
        frameName: frame.name,
      });

      try {
        // Find the top-level frame by name
        const topFrame = figma.currentPage.findOne(
          (n) => n.type === "FRAME" && n.name === frame.figmaFrame
        ) as FrameNode | null;

        if (!topFrame) {
          errors.push(`Frame not found: ${frame.figmaFrame}`);
          skipped++;
          continue;
        }

        if (frame.type === "Standard") {
          await applyCopyToFrame(topFrame, frame.copy, frame.activeVariables);
          applied++;
        } else if (frame.type === "Carousel" && frame.slides) {
          // For carousels, find child frames by slide index
          for (const slide of frame.slides) {
            const slideFrameName = `${frame.figmaFrame}_Slide_${slide.index}`;
            const slideFrame = topFrame.findOne(
              (n) => n.type === "FRAME" && n.name === slideFrameName
            ) as FrameNode | null;

            if (slideFrame) {
              await applyCopyToFrame(slideFrame, slide.copy, slide.activeVariables);
              applied++;
            } else {
              // Try applying to the top frame if no slide sub-frames
              await applyCopyToFrame(topFrame, frame.copy, frame.activeVariables);
              applied++;
              break;
            }
          }
        }
      } catch (err) {
        errors.push(`Error on ${frame.name}: ${String(err)}`);
        skipped++;
      }
    }

    figma.ui.postMessage({ type: "DONE", applied, skipped, errors });
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Apply copy values to text layers inside a frame.
 * Matches layers by name (case-insensitive) against the variable slot names.
 * e.g. a layer named "H1" or "h1" gets the value from copy["H1"].
 *
 * Loads fonts before editing — required by Figma API.
 */
async function applyCopyToFrame(
  frame: FrameNode,
  copy: Record<string, string>,
  activeVariables: string[]
): Promise<void> {
  // Collect all text nodes inside the frame
  const textNodes = frame.findAll((n) => n.type === "TEXT") as TextNode[];

  for (const textNode of textNodes) {
    const layerName = textNode.name.toUpperCase().replace(/\s+/g, "_");

    // Find which variable slot this layer corresponds to
    const matchingSlot = activeVariables.find(
      (slot) => slot.toUpperCase() === layerName
    );

    if (!matchingSlot) continue;

    const newText = copy[matchingSlot];
    if (newText === undefined || newText === null) continue;

    // Load all fonts used in this text node before editing
    const fonts = textNode.getRangeFontName(0, textNode.characters.length);
    if (typeof fonts !== "symbol") {
      // Single font
      await figma.loadFontAsync(fonts as FontName);
    } else {
      // Mixed fonts — load each unique font
      const uniqueFonts = new Set<string>();
      for (let i = 0; i < textNode.characters.length; i++) {
        const font = textNode.getRangeFontName(i, i + 1) as FontName;
        const key = `${font.family}::${font.style}`;
        if (!uniqueFonts.has(key)) {
          uniqueFonts.add(key);
          await figma.loadFontAsync(font);
        }
      }
    }

    textNode.characters = newText;
  }
}
