export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getUser } from "@/lib/get-user";
import { sendNotification } from "@/lib/email";
import { fetchUsersByClientId, fetchAllUsers } from "@/lib/users";
import { fetchCampaignById } from "@/lib/airtable-campaigns";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const CAMPAIGNS_TABLE = "tblSU3bV6StfuFQ2e";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://menteproduction.com";

export type CampaignStatus =
  | "Draft"
  | "Copy_In_Progress"
  | "Ready_For_Figma"
  | "In_Design"
  | "Pending_Review"
  | "Approved"
  | "Delivered";

/** Statuses each role is allowed to set manually */
const ROLE_ALLOWED_STATUSES: Record<string, CampaignStatus[]> = {
  division_admin: [
    "Draft",
    "Copy_In_Progress",
    "Ready_For_Figma",
    "In_Design",
    "Pending_Review",
    "Approved",
    "Delivered",
  ],
  division_designer: ["In_Design", "Pending_Review"],
  client_reviewer: ["Copy_In_Progress", "Ready_For_Figma"],
  client_viewer: [],
};

const ALL_STATUSES: CampaignStatus[] = [
  "Draft",
  "Copy_In_Progress",
  "Ready_For_Figma",
  "In_Design",
  "Pending_Review",
  "Approved",
  "Delivered",
];

async function patchCampaignStatus(
  campaignId: string,
  status: CampaignStatus
): Promise<void> {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${CAMPAIGNS_TABLE}/${campaignId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: { Campaign_Status: status } }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable PATCH failed: ${res.status} ${body}`);
  }
}

/**
 * Determine notification recipients and send email for a given status transition.
 * Looks up users by role + client from the Users table.
 */
export async function triggerStatusNotification(opts: {
  status: CampaignStatus;
  campaignId: string;
  campaignName: string;
  clientName: string;
  /** Airtable record ID of the client (optional — used to scope user lookup) */
  clientId?: string;

}): Promise<string[]> {
  const { status, campaignId, campaignName, clientName, clientId } = opts;
  const campaignUrl = `${APP_URL}/campaigns/${campaignId}`;

  let recipientRoles: string[] = [];
  let subject = "";
  let message = "";

  switch (status) {
    case "Ready_For_Figma":
      recipientRoles = ["division_designer", "division_admin"];
      subject = `[${campaignName}] is ready for design`;
      message = `The copy for <strong>${campaignName}</strong> (${clientName}) has been finalised and the campaign is ready to move into Figma.`;
      break;

    case "Pending_Review":
      recipientRoles = ["client_reviewer"];
      subject = `[${campaignName}] — banners ready for review`;
      message = `The banners for <strong>${campaignName}</strong> (${clientName}) have been exported from Figma and are ready for your review.`;
      break;

    case "Approved":
      recipientRoles = ["division_designer", "division_admin"];
      subject = `[${campaignName}] — all banners approved!`;
      message = `All banners for <strong>${campaignName}</strong> (${clientName}) have been approved by the client. 🎉`;
      break;

    default:
      // No notification for other statuses
      return [];
  }

  // Fetch recipients
  let users: Awaited<ReturnType<typeof fetchAllUsers>> = [];
  try {
    users = clientId
      ? await fetchUsersByClientId(clientId)
      : await fetchAllUsers();
  } catch (err) {
    console.error("[status] Failed to fetch users for notification:", err);
    return [];
  }

  // Filter by target roles; for division roles, include all regardless of client
  const recipients = users.filter((u) => {
    if (u.status !== "Active") return false;
    if (!recipientRoles.includes(u.role)) return false;
    // Division roles see all campaigns
    if (u.role === "division_admin" || u.role === "division_designer") return true;
    // Client roles must belong to this client
    return clientId ? u.clientId === clientId : u.clientName === clientName;
  });

  const emails = recipients.map((u) => u.email).filter(Boolean);
  if (emails.length === 0) return [];

  // Send to each recipient individually so we can personalise the greeting
  for (const recipient of recipients) {
    if (!recipient.email) continue;
    await sendNotification({
      to: [recipient.email],
      subject,
      recipientName: recipient.name,
      campaignName,
      clientName,
      message,
      actionUrl: campaignUrl,
    });
  }

  return emails;
}

/**
 * POST /api/campaigns/[id]/status
 * Body: { status: CampaignStatus }
 * Auth: session required
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const hdrs = await headers();
  const user = getUser(hdrs);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { status } = body;
  if (!status || !ALL_STATUSES.includes(status as CampaignStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${ALL_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const newStatus = status as CampaignStatus;
  const allowedForRole = ROLE_ALLOWED_STATUSES[user.role] ?? [];

  if (!allowedForRole.includes(newStatus)) {
    return NextResponse.json(
      { error: `Role '${user.role}' cannot set status to '${newStatus}'` },
      { status: 403 }
    );
  }

  // Fetch campaign to get name and client info
  let campaign: Awaited<ReturnType<typeof fetchCampaignById>>;
  try {
    campaign = await fetchCampaignById(params.id);
  } catch (err) {
    return NextResponse.json({ error: `Campaign not found: ${err}` }, { status: 404 });
  }

  // Update Airtable
  try {
    await patchCampaignStatus(params.id, newStatus);
  } catch (err) {
    return NextResponse.json({ error: `Failed to update status: ${err}` }, { status: 500 });
  }

  // Send notifications (fire-and-forget)
  const notified = await triggerStatusNotification({
    status: newStatus,
    campaignId: params.id,
    campaignName: campaign.name,
    clientName: campaign.clientName,
  });

  return NextResponse.json({ success: true, status: newStatus, notified });
}
