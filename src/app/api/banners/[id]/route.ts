import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

// Allowlist of fields that can be updated via this route
const ALLOWED_FIELDS = new Set([
  "H1_ET", "H1_EN", "H2_ET", "H2_EN", "H3_ET", "H3_EN",
  "CTA_ET", "CTA_EN", "Price_Tag", "Illustration",
  "Status", "Approval_Status", "Client_Approved", "Comment",
  "Product_Image_URL",
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const recordId = params.id;

    // Filter to only allowed fields
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_FIELDS.has(key)) {
        fields[key] = value;
      }
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}/${recordId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Airtable PATCH error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Banner PATCH failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
