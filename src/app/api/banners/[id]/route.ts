import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

// Allowlist of fields that can be updated via PATCH
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const recordId = params.id;

    // Check if this banner has Carousel slides (Banner_Type = "Slide" with Parent_Banner = this record)
    const slidesParams = new URLSearchParams();
    slidesParams.set(
      "filterByFormula",
      `AND({Banner_Type}="Slide",FIND("${recordId}",ARRAYJOIN({Parent_Banner})))`
    );
    slidesParams.set("fields[]", "id");

    const slidesRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}?${slidesParams.toString()}`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        cache: "no-store",
      }
    );

    let childrenDeleted = 0;

    if (slidesRes.ok) {
      const slidesData = (await slidesRes.json()) as { records: { id: string }[] };
      const slideIds = slidesData.records.map((r) => r.id);

      // Delete child slide records in batches of 10 (Airtable limit)
      for (let i = 0; i < slideIds.length; i += 10) {
        const batch = slideIds.slice(i, i + 10);
        const deleteParams = new URLSearchParams();
        batch.forEach((id) => deleteParams.append("records[]", id));
        await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}?${deleteParams.toString()}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
          }
        );
        childrenDeleted += batch.length;
      }
    }

    // Delete the parent banner record
    const deleteRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}/${recordId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
      }
    );

    if (!deleteRes.ok) {
      const err = await deleteRes.text();
      throw new Error(`Airtable DELETE error ${deleteRes.status}: ${err}`);
    }

    return NextResponse.json({ deleted: true, childrenDeleted });
  } catch (error) {
    console.error("Banner DELETE failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
