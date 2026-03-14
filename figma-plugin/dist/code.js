"use strict";
(() => {
  // src/code.ts
  var SLOT_Y = {
    H1: 40,
    H2: 100,
    H3: 160,
    CTA: 220,
    PRICE_TAG: 280,
    ILLUSTRATION: 340
  };
  var SLOT_SIZE = {
    H1: 32,
    H2: 24,
    H3: 18,
    CTA: 20,
    PRICE_TAG: 24,
    ILLUSTRATION: 16
  };
  var SLOT_STYLE = {
    H1: "Bold",
    H2: "Regular",
    H3: "Regular",
    CTA: "Bold",
    PRICE_TAG: "Bold",
    ILLUSTRATION: "Italic"
  };
  var SLIDE_GAP = 100;
  figma.showUI(__html__, { width: 420, height: 580, title: "Division Banner Factory" });
  (async () => {
    const clientId = await figma.clientStorage.getAsync("dbf_clientId").catch(() => void 0);
    const campaignId = await figma.clientStorage.getAsync("dbf_campaignId").catch(() => void 0);
    figma.ui.postMessage({ type: "READY", savedClientId: clientId, savedCampaignId: campaignId });
  })();
  figma.ui.onmessage = async (msg) => {
    if (msg.type === "RESIZE") {
      figma.ui.resize(msg.width, msg.height);
      return;
    }
    if (msg.type === "CLOSE") {
      figma.closePlugin();
      return;
    }
    if (msg.type === "SAVE_PREFS") {
      const { clientId, campaignId } = msg;
      if (clientId !== void 0)
        await figma.clientStorage.setAsync("dbf_clientId", clientId).catch(() => {
        });
      if (campaignId !== void 0)
        await figma.clientStorage.setAsync("dbf_campaignId", campaignId).catch(() => {
        });
      return;
    }
    if (msg.type === "APPLY_COPY") {
      const { campaignName, frames } = msg;
      let applied = 0;
      let created = 0;
      let updated = 0;
      const errors = [];
      try {
        let page = figma.root.children.find(
          (p) => p.type === "PAGE" && p.name === campaignName
        );
        if (!page) {
          page = figma.createPage();
          page.name = campaignName;
        }
        figma.currentPage = page;
        await loadRequiredFonts();
        const newFrames = [];
        for (let i = 0; i < frames.length; i++) {
          const frameData = frames[i];
          figma.ui.postMessage({
            type: "PROGRESS",
            current: i + 1,
            total: frames.length,
            frameName: frameData.figmaFrame
          });
          try {
            if (frameData.type === "Carousel" && frameData.slides) {
              for (const slide of frameData.slides) {
                const slideFrameName = `${frameData.figmaFrame}_Slide_${slide.index}`;
                const existingSlide = page.findOne(
                  (n) => n.type === "FRAME" && n.name === slideFrameName
                );
                if (existingSlide) {
                  await applyCopyToFrame(existingSlide, slide.copy, slide.activeVariables);
                  updated++;
                  applied++;
                } else {
                  const slideFrame = await createSlideFrame(
                    slideFrameName,
                    frameData.width || 800,
                    frameData.height || 600,
                    slide.copy,
                    slide.activeVariables
                  );
                  page.appendChild(slideFrame);
                  newFrames.push(slideFrame);
                  created++;
                  applied++;
                }
              }
            } else {
              const existing = page.findOne(
                (n) => n.type === "FRAME" && n.name === frameData.figmaFrame
              );
              if (existing) {
                await applyCopyToFrame(existing, frameData.copy, frameData.activeVariables);
                updated++;
                applied++;
              } else {
                const newFrame = await createStandardFrame(frameData);
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
        if (newFrames.length > 0) {
          layoutFramesInGrid(newFrames);
        }
      } catch (err) {
        figma.ui.postMessage({ type: "ERROR", message: String(err) });
        return;
      }
      figma.ui.postMessage({ type: "DONE", applied, created, updated, errors });
    }
    if (msg.type === "EXPORT_TO_MENTE") {
      const page = figma.currentPage;
      const selected = figma.currentPage.selection.filter((n) => n.type === "FRAME" && n.name.startsWith("_MASTER_"));
      const framesToExport = selected.length > 0 ? selected : page.children.filter(
        (n) => n.type === "FRAME" && n.name.startsWith("_MASTER_")
      );
      if (framesToExport.length === 0) {
        figma.ui.postMessage({
          type: "EXPORT_ERROR",
          message: "No _MASTER_ frames found on this page. Run Fetch + Apply first."
        });
        return;
      }
      for (let i = 0; i < framesToExport.length; i++) {
        const frame = framesToExport[i];
        figma.ui.postMessage({
          type: "EXPORT_PROGRESS",
          current: i + 1,
          total: framesToExport.length,
          frameName: frame.name
        });
        try {
          const pngBytes = await frame.exportAsync({
            format: "PNG",
            constraint: { type: "SCALE", value: 1 }
          });
          const base64 = figma.base64Encode(pngBytes);
          figma.ui.postMessage({
            type: "FRAME_EXPORTED",
            frameName: frame.name,
            base64,
            width: frame.width,
            height: frame.height
          });
        } catch (err) {
          figma.ui.postMessage({
            type: "FRAME_EXPORT_ERROR",
            frameName: frame.name,
            error: String(err)
          });
        }
      }
      figma.ui.postMessage({
        type: "EXPORT_DONE",
        exported: framesToExport.length
      });
      return;
    }
  };
  figma.on("selectionchange", () => {
    const selected = figma.currentPage.selection.filter((n) => n.type === "FRAME" && n.name.startsWith("_MASTER_"));
    figma.ui.postMessage({
      type: "SELECTION_CHANGED",
      count: selected.length
    });
  });
  async function createStandardFrame(frameData) {
    const frame = figma.createFrame();
    frame.name = frameData.figmaFrame;
    frame.resize(frameData.width || 800, frameData.height || 600);
    frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    await addTextLayers(frame, frameData.copy, frameData.activeVariables);
    return frame;
  }
  async function createSlideFrame(name, width, height, copy, activeVariables) {
    const frame = figma.createFrame();
    frame.name = name;
    frame.resize(width, height);
    frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    await addTextLayers(frame, copy, activeVariables);
    return frame;
  }
  async function addTextLayers(frame, copy, activeVariables) {
    var _a, _b, _c, _d;
    for (const slot of activeVariables) {
      const slotKey = slot.toUpperCase().replace(/\s+/g, "_");
      const value = (_a = copy[slot]) != null ? _a : `[${slot}]`;
      const textNode = figma.createText();
      textNode.name = slot;
      const style = (_b = SLOT_STYLE[slotKey]) != null ? _b : "Regular";
      const size = (_c = SLOT_SIZE[slotKey]) != null ? _c : 16;
      textNode.fontName = { family: "Inter", style };
      textNode.fontSize = size;
      textNode.characters = value;
      textNode.x = 40;
      textNode.y = (_d = SLOT_Y[slotKey]) != null ? _d : 40 + activeVariables.indexOf(slot) * 60;
      frame.appendChild(textNode);
    }
  }
  var GRID_Y_GAP = 200;
  var LABEL_CLEARANCE = 40;
  function layoutFramesInGrid(frames) {
    const carouselGroups = /* @__PURE__ */ new Map();
    const standardFrames = [];
    for (const frame of frames) {
      const slideMatch = frame.name.match(/^(.+)_Slide_(\d+)$/);
      if (slideMatch) {
        const baseName = slideMatch[1];
        if (!carouselGroups.has(baseName))
          carouselGroups.set(baseName, []);
        carouselGroups.get(baseName).push(frame);
      } else {
        standardFrames.push(frame);
      }
    }
    for (const slides of carouselGroups.values()) {
      slides.sort((a, b) => {
        const ai = parseInt(a.name.match(/_Slide_(\d+)$/)[1]);
        const bi = parseInt(b.name.match(/_Slide_(\d+)$/)[1]);
        return ai - bi;
      });
    }
    const rows = [
      ...standardFrames.map((f) => ({ type: "standard", frame: f })),
      ...[...carouselGroups.entries()].map(([baseName, slides]) => ({ type: "carousel", slides, baseName }))
    ];
    rows.sort((a, b) => {
      const ha = a.type === "standard" ? a.frame.height : a.slides[0].height;
      const hb = b.type === "standard" ? b.frame.height : b.slides[0].height;
      return hb - ha;
    });
    let y = 0;
    for (const row of rows) {
      if (row.type === "standard") {
        const frame = row.frame;
        addFrameLabelText(`${frame.name}  ${frame.width}\xD7${frame.height}`, 0, y);
        frame.x = 0;
        frame.y = y + LABEL_CLEARANCE;
        y += LABEL_CLEARANCE + frame.height + GRID_Y_GAP;
      } else {
        const { slides, baseName } = row;
        const w = slides[0].width;
        const h = slides[0].height;
        addFrameLabelText(`${baseName}  ${w}\xD7${h} (${slides.length} slides)`, 0, y);
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
  function addFrameLabelText(text, x, y) {
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
    } catch (e) {
    }
  }
  async function loadRequiredFonts() {
    const families = ["Inter", "Roboto", "Arial"];
    const styles = ["Regular", "Bold", "Italic"];
    for (const family of families) {
      let allLoaded = true;
      for (const style of styles) {
        try {
          await figma.loadFontAsync({ family, style });
        } catch (e) {
          allLoaded = false;
        }
      }
      if (allLoaded)
        return;
    }
  }
  async function applyCopyToFrame(frame, copy, activeVariables) {
    const textNodes = frame.findAll((n) => n.type === "TEXT");
    for (const textNode of textNodes) {
      const layerKey = textNode.name.toUpperCase().replace(/\s+/g, "_");
      const matchingSlot = activeVariables.find(
        (slot) => slot.toUpperCase().replace(/\s+/g, "_") === layerKey
      );
      if (!matchingSlot)
        continue;
      const newText = copy[matchingSlot];
      if (newText === void 0 || newText === null)
        continue;
      if (textNode.characters.length > 0) {
        const fonts = textNode.getRangeFontName(0, textNode.characters.length);
        if (typeof fonts !== "symbol") {
          await figma.loadFontAsync(fonts);
        } else {
          const seen = /* @__PURE__ */ new Set();
          for (let i = 0; i < textNode.characters.length; i++) {
            const font = textNode.getRangeFontName(i, i + 1);
            const key = `${font.family}::${font.style}`;
            if (!seen.has(key)) {
              seen.add(key);
              await figma.loadFontAsync(font);
            }
          }
        }
      } else {
        await figma.loadFontAsync({ family: "Inter", style: "Regular" }).catch(
          () => figma.loadFontAsync({ family: "Arial", style: "Regular" })
        );
      }
      textNode.characters = newText;
    }
  }
})();
