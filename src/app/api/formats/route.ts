export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const FORMATS_TABLE = "tblSIJqlhuJ6QblzW";
const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}/${FORMATS_TABLE}`;

const headers = () => ({
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  "Content-Type": "application/json",
});

export async function GET() {
  const res = await fetch(`${BASE_URL}?pageSize=100`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ error: "Failed to fetch formats" }, { status: 500 });
  const data = await res.json();
  return NextResponse.json(data.records);
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      fields: {
        Format_Name: body.formatName || "",
        Channel: body.channel || "",
        Device: body.device || "",
        Width: Number(body.width) || 0,
        Height: Number(body.height) || 0,
        Safe_Area: body.safeArea || "",
        Output_Format: body.outputFormat || "PNG",
        Figma_Frame_Base: body.figmaFrameBase || "",
      },
      typecast: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }
  return NextResponse.json(await res.json());
}
