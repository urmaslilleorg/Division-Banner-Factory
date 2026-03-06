import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { updateBannerStatus } from "@/lib/airtable";

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
    const { status, baseId } = body;

    if (!status || !baseId) {
      return NextResponse.json(
        { error: "status and baseId are required" },
        { status: 400 }
      );
    }

    await updateBannerStatus(baseId, params.id, status);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update banner status:", error);
    return NextResponse.json(
      { error: "Failed to update banner status" },
      { status: 500 }
    );
  }
}
