/**
 * Banner type — derived from MCP describe_table on Banners (tblE3Np8VIaKJsqoW).
 * Field names match Airtable exactly (case-sensitive).
 */

/**
 * Per-client variable configuration — maps a global slot to a custom display label.
 */
export interface ClientVariable {
  /** Global slot name, e.g. "H1", "CTA", "Price_Tag" */
  slot: string;
  /** Custom display label for this client, e.g. "Toode", "Osta nüüd" */
  label: string;
}

export type BannerType = "Standard" | "Carousel" | "Slide";

export type BannerStatus =
  | "Draft"
  | "Ready"
  | "Client_Review"
  | "Approved"
  | "Exported"
  | "Archived";

export type ApprovalStatus = "Pending" | "Approved" | "Revision_Requested";

export type Language = "ET" | "EN" | "RU" | "LV" | "LT";

export type Channel =
  | "Delfi"
  | "Postimees"
  | "Google"
  | "Õhtuleht"
  | "SmartAD"
  | "Neti.ee"
  | "Youtube"
  | "Facebook/Instagram"
  | "Web"
  | "DOOH"
  | "Email";

export type Device =
  | "Desktop"
  | "Mobile"
  | "Desktop+Mobile"
  | "Tablet"
  | "DOOH";

export interface Banner {
  /** Airtable record ID (e.g. "rec6SLOIeBpqKPiW7") */
  id: string;
  /** Auto-incrementing banner number */
  bannerId: number;
  /** Format as "WxH" string (e.g. "1080x1080") */
  format: string;
  /** Parsed width in pixels */
  width: number;
  /** Parsed height in pixels */
  height: number;
  /** Workflow status */
  status: BannerStatus;
  /** Client approval status */
  approvalStatus: ApprovalStatus | null;
  /** Whether client has approved */
  clientApproved: boolean;
  /** Language variant */
  language: Language | null;
  /** Campaign name (active field — not legacy "Campaign") */
  campaignName: string;
  /** Copy fields — Estonian */
  h1ET: string;
  h2ET: string;
  h3ET: string;
  ctaET: string;
  /** Copy fields — English */
  h1EN: string;
  h2EN: string;
  h3EN: string;
  ctaEN: string;
  /** Default copy (language-neutral) */
  h1: string;
  h2: string;
  h3: string;
  /** Product image URL */
  imageUrl: string;
  /** Figma frame reference */
  figmaFrame: string;
  /** Revision comment */
  comment: string;
  /** Channel */
  channel: Channel | null;
  /** Device target */
  device: Device | null;
  /** Price tag variant */
  priceTag: string;
  /** Illustration variant */
  illustration: string;
  /** Image asset URL */
  image: string;
  /** Safe area dimensions (e.g. "2800x840") */
  safeArea: string;
  /** Output format */
  outputFormat: string;
  /** Banner type: Standard, Carousel, or Slide */
  bannerType: BannerType;
  /** Slide index (1-based, for Slide type only) */
  slideIndex: number | null;
  /** Parent banner record IDs (for Slide type only) */
  parentBannerIds: string[];
  /** Human-readable banner name following Division naming convention */
  bannerName: string;
  /** Format_Name from the Formats table (e.g. "Display_Horizontal") — used for variable locking */
  formatName: string;
  /** Whether this banner is a video format */
  isVideo: boolean;
  /** URL to the rendered WebM video */
  videoUrl: string;
  /** ID of the animation template used for video rendering */
  animationTemplateId: string;
  /** Nexd creative ID (set after sync to Nexd) */
  nexdCreativeId: string;
  /** Nexd delivery status: "" | "uploaded" | "published" */
  nexdStatus: string;
  /** Nexd embed tag HTML (set after sync to Nexd) */
  nexdEmbedTag: string;
}

/**
 * Parse an Airtable record into a typed Banner object.
 * Handles missing fields gracefully with defaults.
 */
export function parseBannerRecord(record: {
  id: string;
  fields: Record<string, unknown>;
}): Banner {
  const f = record.fields;

  // Parse dimensions from Format field (e.g. "1080x1080" → 1080, 1080)
  const formatStr = (f["Format"] as string) || "";
  const [widthStr, heightStr] = formatStr.split("x");
  const width = parseInt(widthStr, 10) || 0;
  const height = parseInt(heightStr, 10) || 0;

  return {
    id: record.id,
    bannerId: (f["Banner_ID"] as number) || 0,
    format: formatStr,
    width,
    height,
    status: (f["Status"] as BannerStatus) || "Draft",
    approvalStatus: (f["Approval_Status"] as ApprovalStatus) || null,
    clientApproved: (f["Client_Approved"] as boolean) || false,
    language: (f["Language"] as Language) || null,
    campaignName: (f["Campaign_Name"] as string) || (f["Campaign"] as string) || "",
    h1ET: (f["H1_ET"] as string) || "",
    h2ET: (f["H2_ET"] as string) || "",
    h3ET: (f["H3_ET"] as string) || "",
    ctaET: (f["CTA_ET"] as string) || "",
    h1EN: (f["H1_EN"] as string) || "",
    h2EN: (f["H2_EN"] as string) || "",
    h3EN: (f["H3_EN"] as string) || "",
    ctaEN: (f["CTA_EN"] as string) || "",
    h1: (f["H1"] as string) || "",
    h2: (f["H2"] as string) || "",
    h3: (f["H3"] as string) || "",
    imageUrl: (f["Product_Image_URL"] as string) || "",
    figmaFrame: (f["Figma_Frame"] as string) || "",
    comment: (f["Comment"] as string) || "",
    channel: (f["Channel"] as Channel) || null,
    device: (f["Device"] as Device) || null,
    // Price_Tag is a singleSelect field — Airtable returns {name, id} not a plain string.
    priceTag: (typeof f["Price_Tag"] === "object" && f["Price_Tag"] !== null
      ? (f["Price_Tag"] as { name: string }).name
      : (f["Price_Tag"] as string)) || "",
    illustration: (f["Illustration"] as string) || "",
    image: (f["Image"] as string) || "",
    safeArea: (f["Safe_Area"] as string) || "",
    outputFormat: (f["Output_Format"] as string) || "PNG",
    bannerType: (f["Banner_Type"] as BannerType) || "Standard",
    slideIndex: (f["Slide_Index"] as number) || null,
    parentBannerIds: Array.isArray(f["Parent_Banner"]) ? (f["Parent_Banner"] as string[]) : [],
    bannerName: (f["Banner_Name"] as string) || "",
    formatName: (f["Format_Name"] as string) || "",
    isVideo: (f["Is_Video"] as boolean) || false,
    videoUrl: (f["Video_URL"] as string) || "",
    animationTemplateId: (f["Animation_Template_Id"] as string) || "",
    nexdCreativeId: (f["Nexd_Creative_ID"] as string) || "",
    nexdStatus: (f["Nexd_Status"] as string) || "",
    nexdEmbedTag: (f["Nexd_Embed_Tag"] as string) || "",
  };
}
