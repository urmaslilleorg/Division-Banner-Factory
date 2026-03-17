/**
 * GET /api/plugin/download
 * Streams figma-plugin.zip from the repo root.
 * division_admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/get-user";
import { readFileSync } from "fs";
import { join } from "path";

export async function GET(req: NextRequest) {
  const user = getUser(req.headers);
  if (!user || user.role !== "division_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const zipPath = join(process.cwd(), "figma-plugin.zip");
    const buffer = readFileSync(zipPath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="division-banner-factory-plugin.zip"',
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("[plugin/download]", err);
    return NextResponse.json({ error: "Plugin ZIP not found" }, { status: 404 });
  }
}
