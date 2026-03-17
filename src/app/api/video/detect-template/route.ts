import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getUser } from "@/lib/get-user";

// ── Claude prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert video animation analyst. You will receive a sequence of JPEG frames extracted from a short advertising video at 0.5-second intervals (frame 1 = 0.0s, frame 2 = 0.5s, etc.).

Your task is to analyse the frames and identify animated text and visual elements, then classify them into the following variable slots:
- H1: Main headline text (largest, most prominent)
- H2: Secondary headline or subheadline
- H3: Body copy or supporting text
- CTA: Call-to-action button or text (e.g. "Shop now", "Learn more")
- Price_Tag: Price, discount percentage, or promotional label
- Illustration: A graphic, icon, illustration, or decorative visual element
- Image: A product photo, person photo, or background image

For each element you detect, identify:
1. Which frame it first appears (entry_frame)
2. Which frame it disappears or starts to exit (exit_frame)
3. The entry animation effect: fade_in, slide_up, slide_down, slide_left, slide_right, zoom_in, zoom_out, pop, pulse, or none
4. Any visible text content
5. Your confidence (0.0 to 1.0)

Also identify the global exit animation (when the entire scene starts to fade/exit).

IMPORTANT RULES:
- Only classify elements you can clearly see
- If an element is present from the very first frame, entry_frame = 1
- If an element is present until the last frame, exit_frame = last frame number
- Report frame numbers as integers (1-based)
- Return ONLY valid JSON, no other text, no markdown code blocks
- If you cannot detect any animated elements, return an empty elements array

Return this exact JSON structure:
{
  "elements": [
    {
      "slot": "H1",
      "text_content": "SALE 50% OFF",
      "entry_frame": 3,
      "exit_frame": 28,
      "entry_effect": "fade_in",
      "confidence": 0.92
    }
  ],
  "global_exit": {
    "start_frame": 27,
    "effect": "fade_out",
    "confidence": 0.85
  },
  "notes": "Clear retail ad with text overlays on product background."
}`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface DetectTemplateRequest {
  frames: string[];       // base64 JPEG strings
  duration: number;       // seconds
  width: number;
  height: number;
  interval: number;       // seconds between frames (0.5)
}

interface ClaudeElement {
  slot: string;
  text_content: string;
  entry_frame: number;
  exit_frame: number;
  entry_effect: string;
  confidence: number;
}

interface ClaudeResponse {
  elements: ClaudeElement[];
  global_exit: {
    start_frame: number;
    effect: string;
    confidence: number;
  } | null;
  notes: string;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check — division_admin or division_designer only
  const user = getUser(req.headers);
  if (!user || (user.role !== "division_admin" && user.role !== "division_designer")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 503 }
    );
  }

  let body: DetectTemplateRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { frames, duration, interval } = body;

  if (!frames || frames.length === 0) {
    return NextResponse.json({ error: "No frames provided" }, { status: 400 });
  }

  // Build image content blocks for Claude
  const imageBlocks: Anthropic.ImageBlockParam[] = frames.map((b64) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: "image/jpeg",
      data: b64,
    },
  }));

  const userText = `I am sending you ${frames.length} frames from a ${duration.toFixed(1)}-second video, captured every ${interval}s. Frame 1 = 0.0s, frame ${frames.length} = ${((frames.length - 1) * interval).toFixed(1)}s. Please analyse and return the JSON as instructed.`;

  const client = new Anthropic({ apiKey });

  let rawResponse = "";
  let parsed: ClaudeResponse;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: userText },
          ],
        },
      ],
    });

    const block = message.content[0];
    if (block.type !== "text") {
      return NextResponse.json({ error: "Unexpected response type from Claude" }, { status: 422 });
    }
    rawResponse = block.text.trim();

    // Strip markdown code blocks if present
    const jsonStr = rawResponse
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    parsed = JSON.parse(jsonStr) as ClaudeResponse;
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Claude returned invalid JSON", rawResponse },
        { status: 422 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("timeout") || msg.includes("AbortError")) {
      return NextResponse.json({ error: "AI analysis timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Convert frame numbers to timestamps and build VideoTemplate
  const VALID_EFFECTS = [
    "fade_in", "fade_out", "slide_up", "slide_down",
    "slide_left", "slide_right", "zoom_in", "zoom_out",
    "pop", "pulse", "none",
  ];
  const ALL_VARIABLES = ["H1", "H2", "H3", "CTA", "Price_Tag", "Illustration", "Image"];

  const elementsBySlot = new Map<string, ClaudeElement>();
  for (const el of (parsed.elements ?? [])) {
    if (ALL_VARIABLES.includes(el.slot)) {
      elementsBySlot.set(el.slot, el);
    }
  }

  const animations = ALL_VARIABLES.map((v) => {
    const el = elementsBySlot.get(v);
    if (!el) return { variable: v, effect: "none" as const, start: 0, end: 1 };
    const effect = VALID_EFFECTS.includes(el.entry_effect) ? el.entry_effect : "fade_in";
    return {
      variable: v,
      effect: effect as import("@/components/video-templates-manager").AnimationEffect,
      start: Math.round((el.entry_frame - 1) * interval * 10) / 10,
      end: Math.round((el.exit_frame - 1) * interval * 10) / 10,
    };
  });

  const exitData = parsed.global_exit;
  const exitStart = exitData
    ? Math.round((exitData.start_frame - 1) * interval * 10) / 10
    : Math.max(duration - 1, 0);
  const exitEffect = exitData && VALID_EFFECTS.includes(exitData.effect)
    ? exitData.effect
    : "fade_out";
  const exitDuration = Math.max(duration - exitStart, 0.1);

  const template = {
    id: `vtpl_ai_${Date.now().toString(36)}`,
    name: "",
    duration: Math.round(duration * 10) / 10,
    createdAt: new Date().toISOString().slice(0, 10),
    exit: { effect: exitEffect, duration: exitDuration },
    animations,
  };

  // Build analysis response with confidence values
  const analysisElements = (parsed.elements ?? [])
    .filter((el) => ALL_VARIABLES.includes(el.slot))
    .map((el) => ({
      slot: el.slot,
      text_content: el.text_content ?? "",
      entry_frame: el.entry_frame,
      exit_frame: el.exit_frame,
      entry_effect: VALID_EFFECTS.includes(el.entry_effect) ? el.entry_effect : "fade_in",
      confidence: Math.max(0, Math.min(1, el.confidence ?? 0.5)),
    }));

  return NextResponse.json({
    template,
    analysis: {
      elements: analysisElements,
      global_exit: exitData
        ? {
            start_frame: exitData.start_frame,
            effect: exitEffect,
            confidence: Math.max(0, Math.min(1, exitData.confidence ?? 0.5)),
          }
        : null,
      notes: parsed.notes ?? "",
    },
    rawResponse,
  });
}
