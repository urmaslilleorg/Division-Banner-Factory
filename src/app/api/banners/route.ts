export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { parseBannerRecord } from "@/lib/types";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

/**
 * GET /api/banners?parentId=recXXX
 *   Returns all Slide records whose Parent_Banner contains the given record ID.
 *   Used by the BannerDetailModal Slides tab.
 *
 * GET /api/banners?campaignId=recXXX[&approvalStatus=Approved]
 *   Returns all banners linked to the given campaign record ID.
 *   Optionally filter by Approval_Status.
 *   Used by the DownloadZipButton.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId");
    const campaignId = searchParams.get("campaignId");
    const approvalStatus = searchParams.get("approvalStatus");

    let formula: string;

    if (parentId) {
      // Carousel slides lookup
      formula = `AND({Banner_Type}="Slide",FIND("${parentId}",ARRAYJOIN({Parent_Banner})))`;
    } else if (campaignId) {
      // Campaign banners lookup — match by Campaign Link record ID
      const base = `FIND("${campaignId}",ARRAYJOIN({Campaign Link}))`;
      formula = approvalStatus
        ? `AND(${base},{Approval_Status}="${approvalStatus}")`
        : base;
    } else {
      return NextResponse.json(
        { error: "parentId or campaignId is required" },
        { status: 400 }
      );
    }

    // Paginate to get all matching records
    const allRecords: { id: string; fields: Record<string, unknown> }[] = [];
    let offset: string | undefined;
    do {
      const params = new URLSearchParams();
      params.set("filterByFormula", formula);
      if (parentId) {
        params.set("sort[0][field]", "Slide_Index");
        params.set("sort[0][direction]", "asc");
      }
      if (offset) params.set("offset", offset);

      const res = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
          cache: "no-store",
        }
      );

      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json(
          { error: `Airtable error: ${err}` },
          { status: res.status }
        );
      }

      const data = (await res.json()) as {
        records: { id: string; fields: Record<string, unknown> }[];
        offset?: string;
      };
      allRecords.push(...data.records);
      offset = data.offset;
    } while (offset);

    const banners = allRecords.map(parseBannerRecord);
    return NextResponse.json({ banners });
  } catch (error) {
    console.error("GET /api/banners failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
