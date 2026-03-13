export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BRAND_ASSETS_TABLE = "tblXAWuxJ47Bejj5w";
const REGISTRY_RECORD_ID = "recCjnJ8I3v3STPfW"; // Variables Registry record
const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}/${BRAND_ASSETS_TABLE}`;

const authHeaders = () => ({
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  "Content-Type": "application/json",
});

export interface VariableDefinition {
  id: string;
  label: string;
  fields: Record<string, string>; // { ET: "H1_ET", EN: "H1_EN" } or { all: "Price_Tag" }
  type: "text" | "number" | "url";
}

export async function GET() {
  const res = await fetch(`${BASE_URL}/${REGISTRY_RECORD_ID}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ error: "Failed to fetch registry" }, { status: 500 });
  const record = await res.json();
  let variables: VariableDefinition[] = [];
  try {
    variables = JSON.parse(record.fields.Registry_JSON || "[]");
  } catch {
    variables = [];
  }
  return NextResponse.json({ variables, recordId: REGISTRY_RECORD_ID });
}

export async function PATCH(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const variables: VariableDefinition[] = body.variables;

  const res = await fetch(`${BASE_URL}/${REGISTRY_RECORD_ID}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({
      fields: { Registry_JSON: JSON.stringify(variables, null, 2) },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
