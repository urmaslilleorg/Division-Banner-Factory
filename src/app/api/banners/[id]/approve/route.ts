import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

const VALID_STATUSES = new Set(["Pending", "Approved", "Revision_Requested"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Support new format: { approvalStatus: "Approved" | "Pending" | "Revision_Requested" }
    // Also support legacy format: { approved: true/false } for backward compat
    let approvalStatus: string;

    if (typeof body.approvalStatus === "string") {
      if (!VALID_STATUSES.has(body.approvalStatus)) {
        return NextResponse.json(
          { error: "approvalStatus must be Pending, Approved, or Revision_Requested" },
          { status: 400 }
        );
      }
      approvalStatus = body.approvalStatus;
    } else if (typeof body.approved === "boolean") {
      // Legacy: true → Approved, false → Revision_Requested
      approvalStatus = body.approved ? "Approved" : "Revision_Requested";
    } else {
      return NextResponse.json(
        { error: "approvalStatus or approved field is required" },
        { status: 400 }
      );
    }

    const fields: Record<string, unknown> = {
      Approval_Status: approvalStatus,
      Client_Approved: approvalStatus === "Approved",
    };

    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}/${params.id}`,
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

    return NextResponse.json({ success: true, approvalStatus });
  } catch (error) {
    console.error("Failed to update banner approval:", error);
    return NextResponse.json(
      { error: "Failed to update banner" },
      { status: 500 }
    );
  }
}
