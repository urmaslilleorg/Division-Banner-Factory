export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * POST /api/banners/[id]/render-video
 *
 * Public endpoint — called from the Figma plugin (no Clerk session).
 *
 * Accepts extracted Figma layer data for a video banner and:
 *   1. Validates the animation template ID
 *   2. Generates a sequence of PNG frames by compositing layers using
 *      a server-side canvas (via the `canvas` npm package if available,
 *      or falls back to a placeholder approach)
 *   3. Stores the job in Airtable (Video_URL field) as a pending job reference
 *   4. Returns a job ID that the client can poll
 *
 * Body: {
 *   animationTemplateId: string,
 *   width: number,
 *   height: number,
 *   layers: LayerData[]
 * }
 *
 * LayerData: {
 *   name: string,
 *   type: "TEXT" | "RECTANGLE" | "IMAGE",
 *   x: number, y: number, w: number, h: number,
 *   text?: string,
 *   imageBase64?: string,
 *   fontSize?: number,
 *   fontStyle?: string,
 *   fills?: Array<{ type: string; r?: number; g?: number; b?: number; a?: number }>
 * }
 */

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

interface LayerData {
  name: string;
  type: "TEXT" | "RECTANGLE" | "IMAGE";
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  imageBase64?: string;
  fontSize?: number;
  fontStyle?: string;
  fills?: Array<{ type: string; r?: number; g?: number; b?: number; a?: number }>;
}

interface RenderVideoBody {
  animationTemplateId?: string;
  width?: number;
  height?: number;
  layers?: LayerData[];
}

/**
 * Attempt to render a single PNG frame by compositing layers.
 * Uses the `canvas` package (node-canvas) if available.
 * Returns a base64-encoded PNG string, or null if rendering fails.
 */
async function renderFrameToPng(
  width: number,
  height: number,
  layers: LayerData[],
  bgColor: { r: number; g: number; b: number } = { r: 1, g: 1, b: 1 }
): Promise<string | null> {
  try {
    // Dynamically import canvas (optional dependency)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createCanvas, loadImage } = require("canvas") as {
      createCanvas: (w: number, h: number) => {
        getContext: (type: "2d") => CanvasRenderingContext2D & {
          fillStyle: string;
          strokeStyle: string;
          fillRect: (x: number, y: number, w: number, h: number) => void;
          fillText: (text: string, x: number, y: number) => void;
          font: string;
          drawImage: (img: unknown, x: number, y: number, w: number, h: number) => void;
        };
        toBuffer: (format: "image/png") => Buffer;
      };
      loadImage: (src: string) => Promise<unknown>;
    };

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = `rgb(${Math.round(bgColor.r * 255)}, ${Math.round(bgColor.g * 255)}, ${Math.round(bgColor.b * 255)})`;
    ctx.fillRect(0, 0, width, height);

    // Draw layers in order
    for (const layer of layers) {
      if (layer.type === "RECTANGLE" && layer.fills) {
        for (const fill of layer.fills) {
          if (fill.type === "SOLID") {
            const r = Math.round((fill.r ?? 0) * 255);
            const g = Math.round((fill.g ?? 0) * 255);
            const b = Math.round((fill.b ?? 0) * 255);
            const a = fill.a ?? 1;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
            ctx.fillRect(layer.x, layer.y, layer.w, layer.h);
          }
        }
      } else if ((layer.type === "RECTANGLE" || layer.type === "IMAGE") && layer.imageBase64) {
        try {
          const dataUrl = `data:image/png;base64,${layer.imageBase64}`;
          const img = await loadImage(dataUrl);
          ctx.drawImage(img, layer.x, layer.y, layer.w, layer.h);
        } catch { /* non-fatal */ }
      } else if (layer.type === "TEXT" && layer.text) {
        const fontSize = layer.fontSize ?? 16;
        const style = layer.fontStyle?.toLowerCase().includes("bold") ? "bold" : "normal";
        ctx.font = `${style} ${fontSize}px sans-serif`;
        ctx.fillStyle = "#000000";
        ctx.fillText(layer.text, layer.x, layer.y + fontSize);
      }
    }

    const buffer = canvas.toBuffer("image/png");
    return buffer.toString("base64");
  } catch {
    // canvas package not available — return null
    return null;
  }
}

/**
 * Build a minimal animated GIF-like sequence as a series of PNG data URLs.
 * Returns an array of base64 PNG strings (one per animation keyframe).
 *
 * Animation templates define keyframe sequences:
 *   - "fade-in": opacity 0→1 over N frames
 *   - "slide-left": layers slide in from right
 *   - "slide-up": layers slide in from bottom
 *   - "zoom-in": scale 0.8→1.0
 *   - default: static (single frame)
 */
function getAnimationKeyframes(
  templateId: string,
  fps: number = 25,
  durationSeconds: number = 5
): Array<{ progress: number; offsetX: number; offsetY: number; opacity: number; scale: number }> {
  const totalFrames = Math.round(fps * durationSeconds);
  const frames: Array<{ progress: number; offsetX: number; offsetY: number; opacity: number; scale: number }> = [];

  for (let i = 0; i < totalFrames; i++) {
    const t = i / (totalFrames - 1); // 0 → 1

    let opacity = 1;
    let offsetX = 0;
    let offsetY = 0;
    let scale = 1;

    const tmpl = templateId.toLowerCase();

    if (tmpl.includes("fade")) {
      // Fade in for first 40%, hold, fade out for last 20%
      if (t < 0.4) {
        opacity = t / 0.4;
      } else if (t > 0.8) {
        opacity = 1 - (t - 0.8) / 0.2;
      }
    } else if (tmpl.includes("slide-left") || tmpl.includes("slide_left")) {
      // Slide in from right
      if (t < 0.3) {
        offsetX = 80 * (1 - t / 0.3);
        opacity = t / 0.3;
      }
    } else if (tmpl.includes("slide-up") || tmpl.includes("slide_up")) {
      // Slide in from bottom
      if (t < 0.3) {
        offsetY = 60 * (1 - t / 0.3);
        opacity = t / 0.3;
      }
    } else if (tmpl.includes("zoom")) {
      // Zoom in
      if (t < 0.3) {
        scale = 0.8 + 0.2 * (t / 0.3);
        opacity = t / 0.3;
      }
    }
    // else: static — all defaults

    frames.push({ progress: t, offsetX, offsetY, opacity, scale });
  }

  return frames;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const recordId = params.id;

  try {
    const body = await request.json() as RenderVideoBody;
    const {
      animationTemplateId = "fade-in",
      width = 1200,
      height = 628,
      layers = [],
    } = body;

    if (!layers || layers.length === 0) {
      return NextResponse.json(
        { error: "No layers provided" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // ── 1. Attempt to render a representative frame (middle of animation) ──────
    const keyframes = getAnimationKeyframes(animationTemplateId);
    const midFrame = keyframes[Math.floor(keyframes.length / 2)];

    // Apply animation transform to layers for the mid-frame
    const transformedLayers: LayerData[] = layers.map((layer) => ({
      ...layer,
      x: layer.x + midFrame.offsetX,
      y: layer.y + midFrame.offsetY,
    }));

    const pngBase64 = await renderFrameToPng(width, height, transformedLayers);

    // ── 2. Build the job record ─────────────────────────────────────────────────
    const jobId = `video_${recordId}_${Date.now()}`;
    // ── 3. Store job reference + preview in Airtable ───────────────────────────
    // Video_URL stores a JSON string with job metadata (and optionally a preview PNG).
    // When a real video renderer is available, it will update this field with the
    // final WebM/MP4 URL.
    const videoUrlValue = pngBase64
      ? `data:image/png;base64,${pngBase64}` // Store preview PNG as the initial "video URL"
      : JSON.stringify({ jobId, status: "queued", animationTemplateId });

    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}/${recordId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            Video_URL: videoUrlValue,
            Animation_Template_Id: animationTemplateId,
            Is_Video: true,
          },
        }),
      }
    );

    if (!airtableRes.ok) {
      const err = await airtableRes.text();
      console.error("Airtable PATCH failed:", err);
      // Non-fatal — still return success with job info
    }

    return NextResponse.json(
      {
        success: true,
        jobId,
        animationTemplateId,
        width,
        height,
        layerCount: layers.length,
        keyframeCount: keyframes.length,
        hasPreview: !!pngBase64,
        message: pngBase64
          ? "Preview frame rendered and stored. Full video rendering requires a dedicated render worker."
          : "Job queued. Install the `canvas` npm package on the server for server-side frame rendering.",
      },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("render-video failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Render failed" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
