/**
 * Airtable REST API client — server-side only.
 * Never import this file from client components.
 * All calls use AIRTABLE_API_KEY from .env.
 */

import { Banner, parseBannerRecord } from "./types";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const AIRTABLE_BASE_URL = "https://api.airtable.com/v0";

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

interface AirtableListResponse {
  records: AirtableRecord[];
  offset?: string;
}

/**
 * Generic Airtable API request helper.
 */
async function airtableRequest<T>(
  baseId: string,
  tablePath: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${AIRTABLE_BASE_URL}/${baseId}/${tablePath}`;
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Airtable API error ${response.status}: ${errorBody}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Fetch banners from Airtable, filtered by campaign name and optionally by language.
 * Uses filterByFormula with FIND() for campaign matching.
 * Paginates automatically to fetch all matching records.
 */
export async function fetchBanners(
  baseId: string,
  campaignFilter: string,
  languageFilter?: string[],
  includeSlides = false
): Promise<Banner[]> {
  const tableId = "tblE3Np8VIaKJsqoW";

  // Build filter formula
  // By default exclude Slide records — they are child records of Carousel banners
  const conditions: string[] = includeSlides ? [] : [
    `{Banner_Type}!="Slide"`,
  ];

  if (campaignFilter) {
    conditions.push(`FIND("${campaignFilter}", {Campaign_Name})`);
  }

  if (languageFilter && languageFilter.length > 0) {
    if (languageFilter.length === 1) {
      conditions.push(`{Language}="${languageFilter[0]}"`);
    } else {
      const langOr = languageFilter
        .map((l) => `{Language}="${l}"`)
        .join(",");
      conditions.push(`OR(${langOr})`);
    }
  }

  // Build formula: 0 conditions = no filter, 1 = bare condition, 2+ = AND()
  const formula = conditions.length === 0
    ? ""
    : conditions.length === 1
      ? conditions[0]
      : `AND(${conditions.join(",")})`;

  const allRecords: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    if (formula) params.set("filterByFormula", formula);
    if (offset) params.set("offset", offset);
    params.set("pageSize", "100");

    const queryString = params.toString();
    const path = queryString ? `${tableId}?${queryString}` : tableId;

    const response = await airtableRequest<AirtableListResponse>(
      baseId,
      path
    );

    allRecords.push(...response.records);
    offset = response.offset;
  } while (offset);

  return allRecords.map(parseBannerRecord);
}

/**
 * Fetch all banners (no campaign filter) — for the "all banners" view.
 */
export async function fetchAllBanners(baseId: string): Promise<Banner[]> {
  return fetchBanners(baseId, "");
}

/**
 * Update a banner's approval status and optionally add a comment.
 */
export async function updateBannerApproval(
  baseId: string,
  recordId: string,
  approved: boolean,
  comment?: string
): Promise<void> {
  const tableId = "tblE3Np8VIaKJsqoW";

  const fields: Record<string, unknown> = {
    Approval_Status: approved ? "Approved" : "Revision_Requested",
    Client_Approved: approved,
  };

  if (!approved && comment) {
    fields.Comment = comment;
  }

  await airtableRequest(baseId, tableId, {
    method: "PATCH",
    body: JSON.stringify({
      records: [{ id: recordId, fields }],
    }),
  });
}

/**
 * Update a banner's workflow status.
 */
export async function updateBannerStatus(
  baseId: string,
  recordId: string,
  status: string
): Promise<void> {
  const tableId = "tblE3Np8VIaKJsqoW";

  await airtableRequest(baseId, tableId, {
    method: "PATCH",
    body: JSON.stringify({
      records: [{ id: recordId, fields: { Status: status } }],
    }),
  });
}

/**
 * Update a banner's comment field (append to existing).
 */
export async function updateBannerComment(
  baseId: string,
  recordId: string,
  comment: string
): Promise<void> {
  const tableId = "tblE3Np8VIaKJsqoW";

  await airtableRequest(baseId, tableId, {
    method: "PATCH",
    body: JSON.stringify({
      records: [{ id: recordId, fields: { Comment: comment } }],
    }),
  });
}
