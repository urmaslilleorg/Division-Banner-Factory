export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

// Allowlist of fields that can be updated via PATCH
const ALLOWED_FIELDS = new Set([
  "H1_ET", "H1_EN", "H2_ET", "H2_EN", "H3_ET", "H3_EN",
  "CTA_ET", "CTA_EN", "Price_Tag", "Illustration", "Image",
  "Status", "Approval_Status", "Client_Approved", "Comment",
  "Product_Image_URL",
  "Is_Video", "Video_URL", "Animation_Template_Id",
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = "mock-user-id";
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
        // typecast:true allows Airtable to accept string values for singleSelect
        // fields (e.g. Price_Tag) without requiring an exact option ID match.
        body: JSON.stringify({ fields, typecast: true }),
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
    const userId = "mock-user-id";
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const recordId = params.id;

    // ── Fetch the record to determine its type ─────────────────────────────
    const recordRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}/${recordId}`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        cache: "no-store",
      }
    );

    if (!recordRes.ok) {
      const err = await recordRes.text();
      throw new Error(`Airtable GET error ${recordRes.status}: ${err}`);
    }

    const recordData = await recordRes.json() as {
      id: string;
      fields: Record<string, unknown>;
    };

    const bannerType = recordData.fields["Banner_Type"] as string | undefined;

    // ── Case 1: Slide — delete only this record, decrement parent Slide_Count ──
    if (bannerType === "Slide") {
      const parentIds = recordData.fields["Parent_Banner"] as string[] | undefined;

      // Delete the slide record
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

      // Decrement parent Slide_Count if we have a parent
      if (parentIds && parentIds.length > 0) {
        const parentId = parentIds[0];
        try {
          const parentRes = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}/${parentId}`,
            {
              headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
              cache: "no-store",
            }
          );
          if (parentRes.ok) {
            const parentData = await parentRes.json() as { fields: Record<string, unknown> };
            const currentCount = (parentData.fields["Slide_Count"] as number) ?? 0;
            const newCount = Math.max(0, currentCount - 1);
            await fetch(
              `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}/${parentId}`,
              {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ fields: { Slide_Count: newCount } }),
              }
            );
          }
        } catch {
          // Non-fatal — slide was deleted, just couldn't update count
          console.warn("Could not decrement parent Slide_Count for", parentId);
        }
      }

      return NextResponse.json({ deleted: true, type: "Slide", childrenDeleted: 0 });
    }

    // ── Case 2: Carousel parent — cascade-delete all child slides ─────────
    if (bannerType === "Carousel") {
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

      return NextResponse.json({ deleted: true, type: "Carousel", childrenDeleted });
    }

    // ── Case 3: Standard / Specific — simple single-record delete ─────────
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

    return NextResponse.json({ deleted: true, type: bannerType ?? "Standard", childrenDeleted: 0 });
  } catch (error) {
    console.error("Banner DELETE failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
