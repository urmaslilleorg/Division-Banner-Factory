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
  var GRID_GAP = 100;
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
            const existing = figma.currentPage.findOne(
              (n) => n.type === "FRAME" && n.name === frameData.figmaFrame
            );
            if (existing) {
              if (frameData.type === "Standard") {
                await applyCopyToFrame(existing, frameData.copy, frameData.activeVariables);
              } else if (frameData.type === "Carousel" && frameData.slides) {
                for (const slide of frameData.slides) {
                  const slideFrameName = `${frameData.figmaFrame}_Slide_${slide.index}`;
                  const slideFrame = existing.findOne(
                    (n) => n.type === "FRAME" && n.name === slideFrameName
                  );
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
              const newFrame = await createFrameFromPayload(frameData);
              newFrames.push(newFrame);
              created++;
              applied++;
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
  };
  async function createFrameFromPayload(frameData) {
    const frame = figma.createFrame();
    frame.name = frameData.figmaFrame;
    frame.resize(frameData.width || 800, frameData.height || 600);
    frame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    if (frameData.type === "Standard") {
      await addTextLayers(frame, frameData.copy, frameData.activeVariables);
    } else if (frameData.type === "Carousel" && frameData.slides) {
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
      frame.resize(slideX - GRID_GAP, frameData.height || 600);
    }
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
  function layoutFramesInGrid(frames) {
    const ROW_MAX_WIDTH = 4e3;
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    for (const frame of frames) {
      if (x > 0 && x + frame.width > ROW_MAX_WIDTH) {
        x = 0;
        y += rowHeight + GRID_GAP;
        rowHeight = 0;
      }
      frame.x = x;
      frame.y = y;
      x += frame.width + GRID_GAP;
      if (frame.height > rowHeight)
        rowHeight = frame.height;
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
      textNode.characters = newText;
    }
  }
})();
