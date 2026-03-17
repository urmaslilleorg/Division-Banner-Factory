import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getUser } from "@/lib/get-user";

// ── Claude prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert advertising banner analyst. You will receive 1 to 5 banner images (PNG or JPEG) from the same advertising campaign.

Your task is to identify all text and visual elements in each banner and classify them into these variable slots:
- H1: Main headline text (largest, most prominent)
- H2: Secondary headline or subheadline
- H3: Body copy or supporting text
- CTA: Call-to-action button or text (e.g. "Shop now", "Learn more", "Buy now")
- Price_Tag: Price, discount percentage, or promotional label (e.g. "50% OFF", "€29.99")
- Illustration: A graphic, icon, illustration, logo, or decorative visual element
- Image: A product photo, person photo, lifestyle image, or background image

For each banner, extract:
1. Which variable slots are present
2. The exact text content for text slots
3. A description for visual slots (Illustration, Image)
4. Your confidence (0.0 to 1.0) for each element

Then compare across all banners to determine:
- recommended_variables: slots that appear in ALL or most banners (should be active by default)
- common_copy: text that is IDENTICAL across all banners (shared copy)
- variable_copy: text that DIFFERS between banners (per-banner copy)

IMPORTANT RULES:
- Extract exact text as it appears in the banner, including punctuation and capitalisation
- If a slot appears in some but not all banners, still include it but with lower confidence
- Return ONLY valid JSON, no other text, no markdown code blocks

Return this exact JSON structure:
{
  "banners": [
    {
      "index": 0,
      "elements": [
        {
          "slot": "H1",
          "text_content": "SUMMER SALE",
          "confidence": 0.95
        },
        {
          "slot": "Price_Tag",
          "text_content": "UP TO 50% OFF",
          "confidence": 0.98
        },
        {
          "slot": "CTA",
          "text_content": "Shop now",
          "confidence": 0.90
        },
        {
          "slot": "Image",
          "text_content": "Product photo on white background",
          "confidence": 0.85
        }
      ]
    }
  ],
  "recommended_variables": ["H1", "Price_Tag", "CTA", "Image"],
  "common_copy": {
    "H1": "SUMMER SALE",
    "CTA": "Shop now"
  },
  "notes": "Consistent layout across all banners. Price_Tag varies between banners."
}`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyzeRequest {
  images: string[];   // base64 encoded PNG/JPEG
  mimeTypes: string[]; // e.g. "image/png" or "image/jpeg"
}

interface BannerElement {
  slot: string;
  text_content: string;
  confidence: number;
}

interface ClaudeAnalysis {
  banners: Array<{
    index: number;
    elements: BannerElement[];
  }>;
  recommended_variables: string[];
  common_copy: Record<string, string>;
  notes: string;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check — division_admin only
  const user = getUser(req.headers);
  if (!user || user.role !== "division_admin") {
    return NextResponse.json({ error: "Forbidden — division_admin only" }, { status: 403 });
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 503 }
    );
  }

  let body: AnalyzeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { images, mimeTypes } = body;

  if (!images || images.length === 0) {
    return NextResponse.json({ error: "No images provided" }, { status: 400 });
  }
  if (images.length > 5) {
    return NextResponse.json({ error: "Maximum 5 images allowed" }, { status: 400 });
  }

  // Build image content blocks
  const imageBlocks: Anthropic.ImageBlockParam[] = images.map((b64, i) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: (mimeTypes?.[i] ?? "image/png") as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
      data: b64,
    },
  }));

  const userText = `I am sending you ${images.length} banner image${images.length > 1 ? "s" : ""} from the same advertising campaign. Please analyse each banner and return the JSON as instructed.`;

  const client = new Anthropic({ apiKey });

  let rawResponse = "";
  let parsed: ClaudeAnalysis;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
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

    parsed = JSON.parse(jsonStr) as ClaudeAnalysis;
  } catch (err) {
    if (err instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Claude returned invalid JSON", rawResponse },
        { status: 422 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const ALL_VARIABLES = ["H1", "H2", "H3", "CTA", "Price_Tag", "Illustration", "Image"];

  // Normalise and validate
  const normalised: ClaudeAnalysis = {
    banners: (parsed.banners ?? []).map((b, i) => ({
      index: b.index ?? i,
      elements: (b.elements ?? [])
        .filter((el) => ALL_VARIABLES.includes(el.slot))
        .map((el) => ({
          slot: el.slot,
          text_content: el.text_content ?? "",
          confidence: Math.max(0, Math.min(1, el.confidence ?? 0.5)),
        })),
    })),
    recommended_variables: (parsed.recommended_variables ?? []).filter((v) =>
      ALL_VARIABLES.includes(v)
    ),
    common_copy: Object.fromEntries(
      Object.entries(parsed.common_copy ?? {}).filter(([k]) => ALL_VARIABLES.includes(k))
    ),
    notes: parsed.notes ?? "",
  };

  return NextResponse.json({ ...normalised, rawResponse });
}
