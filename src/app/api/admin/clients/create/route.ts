export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const CLIENTS_TABLE = "tblE3eM8D5vlRs6Qq";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      clientName,
      subdomain,
      status,
      languages,
      campaignFilter,
      notes,
      primaryColor,
      secondaryColor,
      accentColor,
      backgroundColor,
      selectedFormatIds,
      figmaAssetFile,
      logoUrl,
      clientVariables,
    } = body;

    if (!clientName || !subdomain) {
      return NextResponse.json(
        { error: "Client name and subdomain are required" },
        { status: 400 }
      );
    }

    const fields: Record<string, unknown> = {
      Client_Name: clientName,
      Subdomain: subdomain,
      Status: status || "Draft",
      Languages: languages || [],
      Campaign_Filter: campaignFilter || "",
      Notes: notes || "",
      Primary_Color: primaryColor || "",
      Secondary_Color: secondaryColor || "",
      Accent_Color: accentColor || "",
      Background_Color: backgroundColor || "",
      Figma_Asset_File: figmaAssetFile || "",
      Logo_URL: logoUrl || "",
      Created_At: new Date().toISOString(),
      Client_Variables: clientVariables || "",
    };

    if (selectedFormatIds && selectedFormatIds.length > 0) {
      fields["Formats"] = selectedFormatIds;
    }

    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields, typecast: true }),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      console.error("Airtable create client error:", errorBody);
      return NextResponse.json(
        { error: "Failed to create client in Airtable" },
        { status: 500 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ id: data.id, subdomain }, { status: 201 });
  } catch (err) {
    console.error("Create client error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
