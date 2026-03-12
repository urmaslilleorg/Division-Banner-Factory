/**
 * POST /api/import/preview
 *
 * Generic spreadsheet preview endpoint — no campaign ID required.
 * Used by the ImportSection component during campaign creation (before a
 * campaign record exists). The campaign-specific endpoint
 * /api/campaigns/[id]/import/preview still exists for the standalone import page.
 *
 * Accepts: multipart/form-data with a .xlsx/.xls/.csv file.
 * Returns: { headers, sampleRows (first 5), rowCount, sheetName }
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
