"use strict";
(() => {
  // src/code.ts
  var _fetchImageCounter = 0;
  var _pendingImageFetches = /* @__PURE__ */ new Map();
  function fetchImageViaUI(url) {
    return new Promise((resolve) => {
      const requestId = `img_${++_fetchImageCounter}`;
      _pendingImageFetches.set(requestId, resolve);
      figma.ui.postMessage({ type: "FETCH_IMAGE", requestId, url });
    });
  }
  var SLOT_Y = {
    H1: 40,
    H2: 100,
    H3: 160,
    CTA: 220,
    PRICE_TAG: 280,
    ILLUSTRATION: 340,
    IMAGE: 400
  };
  var SLOT_SIZE = {
    H1: 32,
    H2: 24,
    H3: 18,
    CTA: 20,
    PRICE_TAG: 24,
    ILLUSTRATION: 16,
    IMAGE: 16
  };
  var SLOT_STYLE = {
    H1: "Bold",
    H2: "Regular",
    H3: "Regular",
    CTA: "Bold",
    PRICE_TAG: "Bold",
    ILLUSTRATION: "Italic",
    IMAGE: "Italic"
  };
  var IMAGE_SLOTS = /* @__PURE__ */ new Set(["Illustration", "Image"]);
  var SLIDE_GAP = 100;
  figma.showUI(__html__, { width: 420, height: 580, title: "Division Banner Factory" });
  (async () => {
    const clientId = await figma.clientStorage.getAsync("dbf_clientId").catch(() => void 0);
    const campaignId = await figma.clientStorage.getAsync("dbf_campaignId").catch(() => void 0);
    const month = await figma.clientStorage.getAsync("dbf_month").catch(() => void 0);
    figma.ui.postMessage({ type: "READY", savedClientId: clientId, savedCampaignId: campaignId, savedMonth: month });
  })();
  figma.ui.onmessage = async (msg) => {
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
      const { clientId, campaignId, month } = msg;
      if (clientId !== void 0)
        await figma.clientStorage.setAsync("dbf_clientId", clientId).catch(() => {
        });
      if (campaignId !== void 0)
        await figma.clientStorage.setAsync("dbf_campaignId", campaignId).catch(() => {
        });
      if (month !== void 0)
        await figma.clientStorage.setAsync("dbf_month", month).catch(() => {
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
                let existingSlide = page.findOne(
                  (n) => n.type === "FRAME" && n.name === slideFrameName
                );
                if (!existingSlide) {
                  const oldSlideFrameName = deriveOldMasterName(slideFrameName);
                  if (oldSlideFrameName) {
                    existingSlide = page.findOne(
                      (n) => n.type === "FRAME" && n.name === oldSlideFrameName
                    );
                    if (existingSlide) {
                      existingSlide.name = slideFrameName;
                    }
                  }
                }
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
              let existing = page.findOne(
                (n) => n.type === "FRAME" && n.name === frameData.figmaFrame
              );
              if (!existing) {
                const oldFrameName = deriveOldMasterName(frameData.figmaFrame);
                if (oldFrameName) {
                  existing = page.findOne(
                    (n) => n.type === "FRAME" && n.name === oldFrameName
                  );
                  if (existing) {
                    existing.name = frameData.figmaFrame;
                  }
                }
              }
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
          layoutFramesInGrid(newFrames, page);
        }
      } catch (err) {
        figma.ui.postMessage({ type: "ERROR", message: String(err) });
        return;
      }
      figma.ui.postMessage({ type: "DONE", applied, created, updated, errors });
    }
    if (msg.type === "CHECK_COPY_STATUS") {
      const { campaignName, frames } = msg;
      const page = figma.root.children.find(
        (p) => p.type === "PAGE" && p.name === campaignName
      );
      const results = [];
      for (const frameData of frames) {
        if (frameData.type === "Carousel" && frameData.slides) {
          for (const slide of frameData.slides) {
            const slideName = `${frameData.figmaFrame}_Slide_${slide.index}`;
            const oldSlideName = deriveOldMasterName(slideName);
            const existing = page ? page.findOne((n) => n.type === "FRAME" && (n.name === slideName || !!oldSlideName && n.name === oldSlideName)) : null;
            if (!existing) {
              results.push({ name: slideName, status: "NEW", changedFields: [] });
              continue;
            }
            const changedFields = compareFrameCopy(existing, slide.copy, slide.activeVariables);
            results.push({
              name: slideName,
              status: changedFields.length > 0 ? "UPDATED" : "UP_TO_DATE",
              changedFields
            });
          }
        } else {
          const oldName = deriveOldMasterName(frameData.figmaFrame);
          const existing = page ? page.findOne((n) => n.type === "FRAME" && (n.name === frameData.figmaFrame || !!oldName && n.name === oldName)) : null;
          if (!existing) {
            results.push({ name: frameData.figmaFrame, status: "NEW", changedFields: [] });
            continue;
          }
          const changedFields = compareFrameCopy(existing, frameData.copy, frameData.activeVariables);
          results.push({
            name: frameData.figmaFrame,
            status: changedFields.length > 0 ? "UPDATED" : "UP_TO_DATE",
            changedFields
          });
        }
      }
      figma.ui.postMessage({ type: "COPY_STATUS", frames: results });
      return;
    }
    if (msg.type === "EXPORT_VIDEO") {
      const { frames: videoFrames, campaignName: vidCampaignName } = msg;
      const vidPage = figma.root.children.find(
        (p) => p.type === "PAGE" && p.name === vidCampaignName
      );
      if (!vidPage) {
        figma.ui.postMessage({
          type: "VIDEO_EXPORT_ERROR",
          message: `Campaign page "${vidCampaignName}" not found. Apply copy first.`
        });
        return;
      }
      const results = [];
      for (let i = 0; i < videoFrames.length; i++) {
        const vf = videoFrames[i];
        figma.ui.postMessage({
          type: "VIDEO_EXPORT_PROGRESS",
          current: i + 1,
          total: videoFrames.length,
          frameName: vf.figmaFrame
        });
        const frame = vidPage.findOne(
          (n) => n.type === "FRAME" && (n.name === vf.figmaFrame || n.name === deriveOldMasterName(vf.figmaFrame))
        );
        if (!frame) {
          figma.ui.postMessage({
            type: "VIDEO_EXPORT_FRAME_ERROR",
            frameName: vf.figmaFrame,
            error: "Frame not found on page"
          });
          continue;
        }
        const layers = [];
        const allNodes = frame.findAll(() => true);
        for (const node of allNodes) {
          if (node.type === "TEXT") {
            const textNode = node;
            layers.push({
              name: textNode.name,
              type: "TEXT",
              x: textNode.x,
              y: textNode.y,
              w: textNode.width,
              h: textNode.height,
              text: textNode.characters,
              fontSize: typeof textNode.fontSize === "number" ? textNode.fontSize : 16,
              fontStyle: typeof textNode.fontName !== "symbol" ? textNode.fontName.style : "Regular"
            });
          } else if (node.type === "RECTANGLE") {
            const rectNode = node;
            const imageFill = rectNode.fills !== figma.mixed ? rectNode.fills.find((f) => f.type === "IMAGE") : void 0;
            let imageBase64;
            if (imageFill == null ? void 0 : imageFill.imageHash) {
              try {
                const img = figma.getImageByHash(imageFill.imageHash);
                if (img) {
                  const bytes = await img.getBytesAsync();
                  imageBase64 = figma.base64Encode(bytes);
                }
              } catch (e) {
              }
            }
            const solidFills = rectNode.fills !== figma.mixed ? rectNode.fills.filter((f) => f.type === "SOLID").map((f) => {
              var _a;
              const sf = f;
              return { type: "SOLID", r: sf.color.r, g: sf.color.g, b: sf.color.b, a: (_a = sf.opacity) != null ? _a : 1 };
            }) : [];
            layers.push({
              name: rectNode.name,
              type: "RECTANGLE",
              x: rectNode.x,
              y: rectNode.y,
              w: rectNode.width,
              h: rectNode.height,
              imageBase64,
              fills: solidFills
            });
          } else if (node.type === "FRAME" || node.type === "GROUP") {
            try {
              const pngBytes = await node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
              layers.push({
                name: node.name,
                type: "IMAGE",
                x: node.x,
                y: node.y,
                w: node.width,
                h: node.height,
                imageBase64: figma.base64Encode(pngBytes)
              });
            } catch (e) {
            }
          }
        }
        results.push({
          recordId: vf.recordId,
          frameName: vf.figmaFrame,
          animationTemplateId: vf.animationTemplateId,
          width: frame.width,
          height: frame.height,
          layers
        });
      }
      figma.ui.postMessage({
        type: "VIDEO_EXPORT_DONE",
        frames: results
      });
      return;
    }
    if (msg.type === "EXPORT_TO_MENTE") {
      const page = figma.currentPage;
      const isExportableFrame = (n) => n.type === "FRAME" && !n.name.startsWith("__label__");
      const selected = figma.currentPage.selection.filter(isExportableFrame);
      const framesToExport = selected.length > 0 ? selected : page.children.filter(isExportableFrame);
      if (framesToExport.length === 0) {
        figma.ui.postMessage({
          type: "EXPORT_ERROR",
          message: "No frames found on this page. Run Fetch + Apply first."
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
    const selected = figma.currentPage.selection.filter((n) => n.type === "FRAME" && !n.name.startsWith("__label__"));
    figma.ui.postMessage({
      type: "SELECTION_CHANGED",
      count: selected.length
    });
  });
  function deriveOldMasterName(newName) {
    if (newName.startsWith("_MASTER_"))
      return null;
    const underscoreIdx = newName.indexOf("_");
    if (underscoreIdx < 0)
      return null;
    const withoutCampaign = newName.slice(underscoreIdx + 1);
    return `_MASTER_${withoutCampaign}`;
  }
  function compareFrameCopy(frame, copy, activeVariables) {
    var _a, _b;
    const changed = [];
    const textMap = /* @__PURE__ */ new Map();
    const textNodes = frame.findAll((n) => n.type === "TEXT");
    for (const node of textNodes) {
      textMap.set(node.name.toUpperCase().replace(/\s+/g, "_"), node.characters);
    }
    const rectImageMap = /* @__PURE__ */ new Map();
    const rectNodes = frame.findAll((n) => n.type === "RECTANGLE");
    for (const rect of rectNodes) {
      const key = rect.name.toUpperCase().replace(/\s+/g, "_");
      const hasImageFill = rect.fills !== figma.mixed && rect.fills.some((f) => f.type === "IMAGE");
      rectImageMap.set(key, hasImageFill);
    }
    for (const slot of activeVariables) {
      const slotKey = slot.toUpperCase().replace(/\s+/g, "_");
      const copyValue = (_a = copy[slot]) != null ? _a : "";
      if (IMAGE_SLOTS.has(slot)) {
        const hasImageFill = (_b = rectImageMap.get(slotKey)) != null ? _b : false;
        const hasUrl = copyValue.startsWith("http") || copyValue.startsWith("data:image");
        if (hasUrl && !hasImageFill) {
          changed.push(slot);
        }
      } else {
        const figmaText = textMap.get(slotKey);
        if (figmaText === void 0) {
          if (copyValue.trim() !== "")
            changed.push(slot);
        } else if (figmaText !== copyValue) {
          changed.push(slot);
        }
      }
    }
    return changed;
  }
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
      const value = (_a = copy[slot]) != null ? _a : "";
      const y = (_b = SLOT_Y[slotKey]) != null ? _b : 40 + activeVariables.indexOf(slot) * 60;
      const isImageSlot = IMAGE_SLOTS.has(slot);
      const isUrl = value.startsWith("http") || value.startsWith("data:image");
      if (isImageSlot && isUrl && value.trim() !== "") {
        await placeImageInFrame(frame, slot, value, y);
      } else if (isImageSlot) {
      } else {
        const displayValue = value.trim() !== "" ? value : `[${slot}]`;
        const textNode = figma.createText();
        textNode.name = slot;
        const style = (_c = SLOT_STYLE[slotKey]) != null ? _c : "Regular";
        const size = (_d = SLOT_SIZE[slotKey]) != null ? _d : 16;
        textNode.fontName = { family: "Inter", style };
        textNode.fontSize = size;
        textNode.characters = displayValue;
        textNode.x = 40;
        textNode.y = y;
        frame.appendChild(textNode);
      }
    }
  }
  async function placeImageInFrame(frame, slotName, url, y) {
    const rect = figma.createRectangle();
    rect.name = slotName;
    rect.x = 40;
    rect.y = y;
    rect.resize(200, 200);
    try {
      let imageData;
      if (url.startsWith("data:image")) {
        const base64 = url.split(",")[1];
        const binary = atob(base64);
        imageData = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          imageData[i] = binary.charCodeAt(i);
        }
      } else {
        const base64 = await fetchImageViaUI(url);
        if (!base64)
          throw new Error("UI fetch returned null");
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
        scaleMode: "FIT"
      }];
    } catch (e) {
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
      } catch (e2) {
      }
    }
    frame.appendChild(rect);
  }
  var GRID_Y_GAP = 200;
  var LABEL_CLEARANCE = 40;
  function layoutFramesInGrid(frames, page) {
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
        addFrameLabelText(page, `${frame.name}  ${frame.width}\xD7${frame.height}`, 0, y);
        frame.x = 0;
        frame.y = y + LABEL_CLEARANCE;
        y += LABEL_CLEARANCE + frame.height + GRID_Y_GAP;
      } else {
        const { slides, baseName } = row;
        const w = slides[0].width;
        const h = slides[0].height;
        addFrameLabelText(page, `${baseName}  ${w}\xD7${h} (${slides.length} slides)`, 0, y);
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
  function addFrameLabelText(page, text, x, y) {
    try {
      const label = figma.createText();
      label.name = `__label__${text}`;
      label.fontName = { family: "Inter", style: "Regular" };
      label.fontSize = 16;
      label.fills = [{ type: "SOLID", color: { r: 0.6, g: 0.6, b: 0.6 } }];
      label.characters = text;
      label.x = x;
      label.y = y;
      page.appendChild(label);
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
    var _a, _b;
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
    for (const slot of activeVariables) {
      if (!IMAGE_SLOTS.has(slot))
        continue;
      const slotKey = slot.toUpperCase().replace(/\s+/g, "_");
      const url = (_a = copy[slot]) != null ? _a : "";
      const isUrl = url.startsWith("http") || url.startsWith("data:image");
      const labelName = `${slot}_placeholder_label`;
      const staleLabels = frame.findAll(
        (n) => n.type === "TEXT" && n.name === labelName
      );
      for (const lbl of staleLabels)
        lbl.remove();
      const existingRect = frame.findOne(
        (n) => n.type === "RECTANGLE" && n.name.toUpperCase().replace(/\s+/g, "_") === slotKey
      );
      if (isUrl && url.trim() !== "") {
        if (existingRect) {
          try {
            let imageData;
            if (url.startsWith("data:image")) {
              const base64 = url.split(",")[1];
              const binary = atob(base64);
              imageData = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++)
                imageData[i] = binary.charCodeAt(i);
            } else {
              const base64 = await fetchImageViaUI(url);
              if (!base64)
                throw new Error("UI fetch returned null for " + url);
              const binary = atob(base64);
              imageData = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++)
                imageData[i] = binary.charCodeAt(i);
            }
            const image = figma.createImage(imageData);
            existingRect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FIT" }];
          } catch (imgErr) {
            figma.ui.postMessage({ type: "LOG", message: `[DBF] image fill failed for ${slot}: ${imgErr}` });
          }
        } else {
          const y = (_b = SLOT_Y[slotKey]) != null ? _b : 400;
          await placeImageInFrame(frame, slot, url, y);
        }
      } else {
        if (existingRect)
          existingRect.remove();
      }
    }
  }
})();
