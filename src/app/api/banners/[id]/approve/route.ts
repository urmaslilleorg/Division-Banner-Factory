import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { updateBannerApproval } from "@/lib/airtable";

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
    const { approved, comment, baseId } = body;

    if (typeof approved !== "boolean") {
      return NextResponse.json(
        { error: "approved field must be a boolean" },
        { status: 400 }
      );
    }

    if (!baseId) {
      return NextResponse.json(
        { error: "baseId is required" },
        { status: 400 }
      );
    }

    await updateBannerApproval(baseId, params.id, approved, comment);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update banner approval:", error);
    return NextResponse.json(
      { error: "Failed to update banner" },
      { status: 500 }
    );
  }
}
