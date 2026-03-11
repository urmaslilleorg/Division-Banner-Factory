import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { updateBannerApproval } from "@/lib/airtable";

const BASE_ID = "appIqinespXjbIERp";

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
    const { approved, comment } = body;

    if (typeof approved !== "boolean") {
      return NextResponse.json(
        { error: "approved field must be a boolean" },
        { status: 400 }
      );
    }

    await updateBannerApproval(BASE_ID, params.id, approved, comment);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update banner approval:", error);
    return NextResponse.json(
      { error: "Failed to update banner" },
      { status: 500 }
    );
  }
}
