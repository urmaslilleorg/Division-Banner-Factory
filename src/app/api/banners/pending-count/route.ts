export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

/**
 * GET /api/banners/pending-count
 *
 * Returns the count of banners requiring attention, based on role:
 * - division_admin / division_designer: count where Approval_Status = "Revision_Requested"
 * - client_reviewer: count where Approval_Status = "Pending" AND Status = "Client_Review"
 *
 * Role is passed as a query param. Can be derived from x-user-role header set by middleware.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = "mock-user-id";
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role") || "division_admin";

    let formula: string;
    if (role === "client_reviewer") {
      formula = `AND({Approval_Status}="Pending",{Status}="Client_Review")`;
    } else {
      formula = `{Approval_Status}="Revision_Requested"`;
    }

    const params = new URLSearchParams({
      filterByFormula: formula,
      "fields[]": "Banner_ID",
      pageSize: "100",
    });

    let count = 0;
    let offset: string | undefined;

    do {
      if (offset) params.set("offset", offset);
      const res = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}?${params}`,
        {
          headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
          cache: "no-store",
        }
      );

      if (!res.ok) {
        throw new Error(`Airtable error ${res.status}`);
      }

      const data = await res.json();
      count += data.records.length;
      offset = data.offset;
    } while (offset);

    return NextResponse.json({ count });
  } catch (error) {
    console.error("pending-count failed:", error);
    return NextResponse.json({ count: 0 });
  }
}
