export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/**
 * GET /api/nexd/templates[?refresh=1]
 * Auth: division_admin only.
 *
 * Returns the list of available Nexd templates, cached in-memory for 1 hour.
 * Pass ?refresh=1 to force a re-fetch and bust the cache.
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getUser } from "@/lib/get-user";
import { listNexdTemplates } from "@/lib/nexd";

// ── In-memory cache ───────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cachedTemplates: unknown[] | null = null;
let cacheTimestamp = 0;

export async function GET(request: NextRequest) {
  const hdrs = await headers();
  const user = getUser(hdrs);
  if (!user || user.role !== "division_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.NEXD_API_KEY) {
    return NextResponse.json({ templates: [], cached: false });
  }

  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  const now = Date.now();
  const cacheValid = !forceRefresh && cachedTemplates !== null && now - cacheTimestamp < CACHE_TTL_MS;

  if (cacheValid) {
    return NextResponse.json({
      templates: cachedTemplates,
      cached: true,
      cachedAt: new Date(cacheTimestamp).toISOString(),
    });
  }

  try {
    const templates = await listNexdTemplates();
    cachedTemplates = templates;
    cacheTimestamp = Date.now();
    return NextResponse.json({
      templates,
      cached: false,
      cachedAt: new Date(cacheTimestamp).toISOString(),
    });
  } catch (err) {
    console.error("[nexd/templates] Error:", err);
    // Return stale cache if available rather than an error
    if (cachedTemplates !== null) {
      return NextResponse.json({
        templates: cachedTemplates,
        cached: true,
        stale: true,
        cachedAt: new Date(cacheTimestamp).toISOString(),
        warning: "Using stale cache due to fetch error",
      });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
