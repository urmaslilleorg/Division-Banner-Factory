import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/image-proxy?url=<encoded-url>
 *
 * Server-side image proxy for the Figma plugin.
 *
 * The Figma plugin UI iframe cannot directly fetch() Vercel Blob URLs because
 * the Blob CDN returns a Content-Security-Policy header that the browser
 * enforces inside the sandboxed iframe context. This proxy fetches the image
 * server-side (no CSP restrictions) and streams the bytes back to the plugin.
 *
 * Only allows fetching from trusted domains (Vercel Blob CDN).
 * Returns CORS headers so the Figma iframe can call it.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ALLOWED_HOSTNAME_SUFFIXES = [
  ".public.blob.vercel-storage.com",
  ".vercel.app",
  "localhost",
];

function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return ALLOWED_HOSTNAME_SUFFIXES.some((suffix) =>
      u.hostname === suffix.replace(/^\./, "") || u.hostname.endsWith(suffix)
    );
  } catch {
    return false;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing url parameter", {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  if (!isAllowedUrl(url)) {
    return new NextResponse("URL not allowed", {
      status: 403,
      headers: CORS_HEADERS,
    });
  }

  try {
    const upstream = await fetch(url, { cache: "no-store" });
    if (!upstream.ok) {
      return new NextResponse(`Upstream error: ${upstream.status}`, {
        status: 502,
        headers: CORS_HEADERS,
      });
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        // Strip the upstream CSP so the browser doesn't apply it to the response
        "Content-Security-Policy": "",
      },
    });
  } catch (err) {
    return new NextResponse(`Proxy fetch failed: ${err}`, {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}
