/**
 * GET /api/clients/list
 *
 * Public endpoint (no auth) — used by the Figma plugin.
 * Returns all Active clients with id, name, and subdomain.
 *
 * CORS: allows all origins.
 */

import { NextResponse } from "next/server";
import { fetchAllClients } from "@/lib/airtable-clients";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const clients = await fetchAllClients();

    const active = clients
      .filter((c) => c.status === "Active")
      .map((c) => ({
        id: c.id,
        name: c.name,
        subdomain: c.subdomain,
      }));

    return NextResponse.json(active, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("GET /api/clients/list error:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
