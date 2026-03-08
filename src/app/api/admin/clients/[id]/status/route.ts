import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const CLIENTS_TABLE = "tblE3eM8D5vlRs6Qq";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { id } = params;
    const { status } = body;

    if (!status || !["Active", "Draft", "Archived"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status value" },
        { status: 400 }
      );
    }

    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: { Status: status }, typecast: true }),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      console.error("Airtable update status error:", errorBody);
      return NextResponse.json(
        { error: "Failed to update client status" },
        { status: 500 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ id: data.id });
  } catch (err) {
    console.error("Update client status error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
