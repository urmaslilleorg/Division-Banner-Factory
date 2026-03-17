import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getUser } from "@/lib/get-user";

// ─── Prompt ──────────────────────────────────────────────────────────────────
const buildPrompt = (clientName: string) => `
You are analyzing advertising banner images from a client called "${clientName}" in Estonia.

For each text element found in the banners, classify it as one of these variable slots:
- H1: main headline (largest, most prominent text)
- H2: subheadline (secondary prominent text)
- H3: body text, brand name, or tertiary text
- CTA: call-to-action button text (e.g. "Osta", "Vaata", "Tutvu")
- Price_Tag: price, discount percentage, or offer text (e.g. "-40%", "9.99€")

For visual/image elements:
- Illustration: product photo, product illustration, or main visual element
- Image: background image, secondary image, or decorative visual

For each detected element, report:
- slot: one of the slot names above
- detected: true
- suggestedLabel: a client-specific label IN ESTONIAN. Use these as defaults but adapt based on what you actually see:
  H1 → "Pealkiri", H2 → "Alapealkiri", H3 → "Bränd" or "Kirjeldus",
  CTA → "Nupp" or "Tegevus", Price_Tag → "Hind" or "Soodushind",
  Illustration → "Toode" or "Pilt", Image → "Taust" or "Lisa pilt"
  If the detected text or context suggests a more specific label, use that instead.
- detectedText: the actual text found (for text elements) or a brief description (for visual elements)
- confidence: a number between 0 and 1

If multiple banners are provided, identify elements that appear consistently across banners.
For slots NOT detected in any banner, still include them with detected: false, confidence: 0, detectedText: null.

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "variables": [
    {
      "slot": "H1",
      "detected": true,
      "suggestedLabel": "Pealkiri",
      "detectedText": "APTEEGIKOSMEETIKA",
      "confidence": 0.95
    },
    {
      "slot": "H2",
      "detected": false,
      "suggestedLabel": "Alapealkiri",
      "detectedText": null,
      "confidence": 0
    }
  ],
  "notes": "Brief observations about the banner structure"
}

Include ALL 7 slots in the response: H1, H2, H3, CTA, Price_Tag, Illustration, Image.
`.trim();

// ─── Route ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Auth: division_admin only
  const user = getUser(req.headers);
  if (!user || user.role !== "division_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 501 }
    );
  }

  let body: { images: string[]; clientName: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { images, clientName } = body;

  if (!images || !Array.isArray(images) || images.length === 0) {
    return NextResponse.json(
      { error: "At least one image is required" },
      { status: 400 }
    );
  }

  if (images.length > 3) {
    return NextResponse.json(
      { error: "Maximum 3 images allowed" },
      { status: 400 }
    );
  }

  // Build Claude message content — each image as a vision block
  const imageBlocks: Anthropic.ImageBlockParam[] = images.map((base64) => {
    // base64 may include data URL prefix: "data:image/png;base64,..."
    const match = base64.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    const mediaType = (match?.[1] ?? "image/png") as
      | "image/png"
      | "image/jpeg"
      | "image/gif"
      | "image/webp";
    const data = match?.[2] ?? base64;
    return {
      type: "image",
      source: { type: "base64", media_type: mediaType, data },
    };
  });

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: buildPrompt(clientName || "Unknown Client") },
          ],
        },
      ],
    });

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    // Parse JSON from Claude
    let parsed: {
      variables: Array<{
        slot: string;
        detected: boolean;
        suggestedLabel: string;
        detectedText: string | null;
        confidence: number;
      }>;
      notes: string;
    };

    try {
      // Strip any accidental markdown code fences
      const cleaned = rawText.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        {
          error: "Claude returned invalid JSON",
          rawResponse: rawText,
        },
        { status: 422 }
      );
    }

    // Map to Client_Variables format (only detected slots)
    const variables = parsed.variables
      .filter((v) => v.detected)
      .map((v) => ({ slot: v.slot, label: v.suggestedLabel }));

    return NextResponse.json({
      variables,
      rawAnalysis: parsed.variables,
      notes: parsed.notes ?? "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("timeout") || message.includes("ETIMEDOUT")) {
      return NextResponse.json(
        { error: "Analysis timed out. Please try again." },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: `Analysis failed: ${message}` },
      { status: 500 }
    );
  }
}
