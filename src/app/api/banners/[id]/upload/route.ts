import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

/**
 * POST /api/banners/[id]/upload
 *
 * Accepts a multipart form with a PNG/JPG file.
 * In Phase 4, this stores the file as a data URL in Product_Image_URL
 * and resets Approval_Status to Pending with a system comment.
 *
 * Phase 6 will replace this with an S3/Cloudflare upload.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      return NextResponse.json(
        { error: "Only PNG and JPG files are accepted" },
        { status: 400 }
      );
    }

    // Convert to base64 data URL (Phase 4 placeholder — Phase 6 will use S3)
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    const timestamp = new Date().toISOString();
    const systemComment = `[System] [${timestamp}]: New version uploaded`;

    // PATCH the banner record
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}/${params.id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            Product_Image_URL: dataUrl,
            Approval_Status: "Pending",
            Comment: systemComment,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Airtable PATCH error ${res.status}: ${err}`);
    }

    return NextResponse.json({
      success: true,
      url: dataUrl.substring(0, 50) + "…", // truncated for response
      timestamp,
    });
  } catch (error) {
    console.error("Upload failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
