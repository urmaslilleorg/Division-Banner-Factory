export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

// Fields that accept a URL string
const ALLOWED_ASSET_FIELDS = new Set(["Image", "Illustration"]);

/**
 * POST /api/banners/[id]/upload-asset
 *
 * Accepts multipart/form-data with:
 *   - file: the image file (PNG, JPG, WebP, SVG)
 *   - field: the Airtable field name ("Image" or "Illustration")
 *
 * Flow:
 *   1. Validate file type and size
 *   2. Upload to Vercel Blob → get a permanent public URL
 *   3. PATCH the Airtable banner record with { [field]: url }
 *   4. Return { url }
 *
 * This avoids storing base64 data URLs in Airtable (which hit the
 * character limit and cause the thumbnail-vanish bug).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const field = formData.get("field") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!field || !ALLOWED_ASSET_FIELDS.has(field)) {
      return NextResponse.json(
        { error: `Invalid field. Must be one of: ${Array.from(ALLOWED_ASSET_FIELDS).join(", ")}` },
        { status: 400 }
      );
    }

    const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use PNG, JPG, WebP, or SVG." },
        { status: 400 }
      );
    }

    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10 MB." },
        { status: 400 }
      );
    }

    const recordId = params.id;
    const ext = file.name.split(".").pop() || "png";
    const blobPath = `banners/${recordId}/${field.toLowerCase()}-${Date.now()}.${ext}`;

    // Upload to Vercel Blob
    const blob = await put(blobPath, file, {
      access: "public",
      contentType: file.type,
    });

    // PATCH Airtable with the public URL
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}/${recordId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: { [field]: blob.url } }),
      }
    );

    if (!airtableRes.ok) {
      const err = await airtableRes.text();
      // Blob was uploaded — clean up is best-effort, don't block response
      throw new Error(`Airtable PATCH error ${airtableRes.status}: ${err}`);
    }

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("upload-asset failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
