/**
 * GET /api/admin/clients/[id]/assets
 *
 * Fetches the Figma asset library for a client.
 * Uses FIGMA_ACCESS_TOKEN (server-side only — never exposed to the browser).
 *
 * Returns assets grouped by top-level Figma frame name:
 * Backgrounds | Illustrations | Logos | Overlays | Products
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchClientById } from "@/lib/airtable-clients";

// Token stored server-side only. Note: rotate periodically as it grants read access
// to all Figma files the token owner can access.
const FIGMA_ACCESS_TOKEN = process.env.FIGMA_ACCESS_TOKEN || "";

const ASSET_GROUPS = ["Backgrounds", "Illustrations", "Logos", "Overlays", "Products"];

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
}

interface FigmaFile {
  document: { children: FigmaNode[] };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = await fetchClientById(params.id);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    if (!client.figmaAssetFile) {
      return NextResponse.json({ assets: [] });
    }

    if (!FIGMA_ACCESS_TOKEN) {
      return NextResponse.json(
        { error: "FIGMA_ACCESS_TOKEN not configured" },
        { status: 500 }
      );
    }

    const fileKey = client.figmaAssetFile;

    // Fetch the Figma file structure
    const fileRes = await fetch(
      `https://api.figma.com/v1/files/${fileKey}?depth=3`,
      {
        headers: { "X-Figma-Token": FIGMA_ACCESS_TOKEN },
        cache: "no-store",
      }
    );

    if (!fileRes.ok) {
      const body = await fileRes.text();
      console.error("Figma file fetch error:", body);
      return NextResponse.json(
        { error: `Figma API error: ${fileRes.status}` },
        { status: 502 }
      );
    }

    const fileData: FigmaFile = await fileRes.json();

    // Collect asset nodes from matching top-level pages/frames
    const assetNodes: { nodeId: string; name: string; group: string }[] = [];

    const pages = fileData.document.children || [];
    for (const page of pages) {
      const group = ASSET_GROUPS.find(
        (g) => page.name.toLowerCase().includes(g.toLowerCase())
      );
      if (!group) continue;

      const children = page.children || [];
      for (const child of children) {
        assetNodes.push({
          nodeId: child.id,
          name: child.name,
          group,
        });
      }
    }

    if (assetNodes.length === 0) {
      return NextResponse.json({ assets: [] });
    }

    // Fetch thumbnails for all asset nodes
    const nodeIds = assetNodes.map((n) => n.nodeId).join(",");
    const imgRes = await fetch(
      `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeIds)}&format=png&scale=1`,
      {
        headers: { "X-Figma-Token": FIGMA_ACCESS_TOKEN },
        cache: "no-store",
      }
    );

    let thumbnailMap: Record<string, string> = {};
    if (imgRes.ok) {
      const imgData = await imgRes.json();
      thumbnailMap = imgData.images || {};
    }

    const assets = assetNodes.map((n) => ({
      ...n,
      thumbnailUrl: thumbnailMap[n.nodeId] || null,
    }));

    return NextResponse.json({ assets });
  } catch (err) {
    console.error("Assets route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
