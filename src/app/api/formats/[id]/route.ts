export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const FORMATS_TABLE = "tblSIJqlhuJ6QblzW";
const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}/${FORMATS_TABLE}`;

const authHeaders = () => ({
  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  "Content-Type": "application/json",
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = "mock-user-id";
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const fields: Record<string, unknown> = {};
  if (body.formatName !== undefined) fields["Format_Name"] = body.formatName;
  if (body.channel !== undefined) fields["Channel"] = body.channel;
  if (body.device !== undefined) fields["Device"] = body.device;
  if (body.width !== undefined) fields["Width"] = Number(body.width);
  if (body.height !== undefined) fields["Height"] = Number(body.height);
  if (body.safeArea !== undefined) fields["Safe_Area"] = body.safeArea;
  if (body.outputFormat !== undefined) fields["Output_Format"] = body.outputFormat;
  if (body.figmaFrameBase !== undefined) fields["Figma_Frame_Base"] = body.figmaFrameBase;
  if (body.nexdTemplateId !== undefined) fields["Nexd_Template_ID"] = body.nexdTemplateId;

  const res = await fetch(`${BASE_URL}/${params.id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }
  return NextResponse.json(await res.json());
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = "mock-user-id";
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${BASE_URL}/${params.id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
