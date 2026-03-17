export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getUser } from "@/lib/get-user";
import { maybeAutoSetApproved } from "@/lib/campaign-status-helpers";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

const VALID_STATUSES = new Set(["Pending", "Approved", "Revision_Requested"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const hdrs = await headers();
  const user = getUser(hdrs);

  if (!user) {
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

    // Fetch the updated banner to get its campaign link
    const updatedBanner = await res.json() as {
      id: string;
      fields: Record<string, unknown>;
    };

    // Auto-trigger: if approved, check if all campaign banners are now approved
    if (approvalStatus === "Approved") {
      const campaignLink = updatedBanner.fields["Campaign Link"] as string[] | undefined;
      const campaignId = campaignLink?.[0];
      if (campaignId) {
        // Fire-and-forget
        maybeAutoSetApproved(campaignId).catch((err) =>
          console.error("[approve] auto-trigger error:", err)
        );
      }
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
