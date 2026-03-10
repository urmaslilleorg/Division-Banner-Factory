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

    const fields: Record<string, unknown> = {};

    if (clientName !== undefined) fields["Client_Name"] = clientName;
    if (subdomain !== undefined) fields["Subdomain"] = subdomain;
    if (status !== undefined) fields["Status"] = status;
    if (languages !== undefined) fields["Languages"] = languages;
    if (campaignFilter !== undefined) fields["Campaign_Filter"] = campaignFilter;
    if (notes !== undefined) fields["Notes"] = notes;
    if (primaryColor !== undefined) fields["Primary_Color"] = primaryColor;
    if (secondaryColor !== undefined) fields["Secondary_Color"] = secondaryColor;
    if (accentColor !== undefined) fields["Accent_Color"] = accentColor;
    if (backgroundColor !== undefined) fields["Background_Color"] = backgroundColor;
    if (selectedFormatIds !== undefined) fields["Formats"] = selectedFormatIds;
    if (figmaAssetFile !== undefined) fields["Figma_Asset_File"] = figmaAssetFile;
    if (logoUrl !== undefined) fields["Logo_URL"] = logoUrl;
    if (clientVariables !== undefined) fields["Client_Variables"] = clientVariables;

    const res = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields, typecast: true }),
      }
    );

    if (!res.ok) {
      const errorBody = await res.text();
      console.error("Airtable update client error:", errorBody);
      return NextResponse.json(
        { error: "Failed to update client in Airtable" },
        { status: 500 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ id: data.id });
  } catch (err) {
    console.error("Update client error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
