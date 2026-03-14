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
 * POST /api/banners/[id]/upload-image
 *
 * Public endpoint — called from the Figma plugin (no Clerk session).
 * Accepts a base64 PNG and stores it as a data URL in Product_Image_URL.
 *
 * Body: { image: "data:image/png;base64,...", fileName: "frame.png" }
 * Returns: { success: true, imageUrl: "data:image/png;base64,..." }
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as { image?: string; fileName?: string };
    const { image, fileName } = body;

    if (!image || !image.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Missing or invalid image field (expected data:image/... base64 string)" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const recordId = params.id;

    // Store the data URL directly in Product_Image_URL.
    // Airtable URL fields accept strings up to ~100 KB; for larger images
    // this will be replaced with Vercel Blob upload in a future phase.
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}/${recordId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            Product_Image_URL: image,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Airtable PATCH error ${res.status}: ${err}`);
    }

    return NextResponse.json(
      { success: true, imageUrl: image.substring(0, 60) + "…", fileName },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("upload-image failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
