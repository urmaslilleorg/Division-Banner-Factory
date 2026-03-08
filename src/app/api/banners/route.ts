import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { parseBannerRecord } from "@/lib/types";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const BANNERS_TABLE = "tblE3Np8VIaKJsqoW";

/**
 * GET /api/banners?parentId=recXXX
 * Returns all Slide records whose Parent_Banner contains the given record ID.
 * Used by the BannerDetailModal Slides tab.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId");

    if (!parentId) {
      return NextResponse.json({ error: "parentId is required" }, { status: 400 });
    }

    // Filter by Banner_Type=Slide AND Parent_Banner contains the parentId
    const formula = `AND({Banner_Type}="Slide",FIND("${parentId}",ARRAYJOIN({Parent_Banner})))`;

    const params = new URLSearchParams();
    params.set("filterByFormula", formula);
    params.set("sort[0][field]", "Slide_Index");
    params.set("sort[0][direction]", "asc");

    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${BANNERS_TABLE}?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        },
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
    };

    const banners = data.records.map(parseBannerRecord);

    return NextResponse.json({ banners });
  } catch (error) {
    console.error("GET /api/banners failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
