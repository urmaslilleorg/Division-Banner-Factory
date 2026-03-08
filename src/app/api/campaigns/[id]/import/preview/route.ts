/**
 * POST /api/campaigns/[id]/import/preview
 *
 * Accepts a multipart form upload with a .xlsx/.xls/.csv file.
 * Returns: { headers, sampleRows (first 5), rowCount, sheetName }
 * Used by the column mapping UI to show what's in the file before import.
 */

import { NextRequest, NextResponse } from "next/server";
import { parseSpreadsheet } from "@/lib/spreadsheet-parser";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const mimeType = file.type;
    const buffer = Buffer.from(await file.arrayBuffer());

    const parsed = parseSpreadsheet(buffer, mimeType);

    return NextResponse.json({
      headers: parsed.headers,
      sampleRows: parsed.rows.slice(0, 5),
      rowCount: parsed.rowCount,
      sheetName: parsed.sheetName,
    });
  } catch (err) {
    console.error("[import/preview] error:", err);
    return NextResponse.json(
      { error: "Failed to parse file", details: String(err) },
      { status: 500 }
    );
  }
}
