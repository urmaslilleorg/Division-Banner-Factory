import bcrypt from "bcryptjs";

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "";
const BASE_ID = "appIqinespXjbIERp";
const USERS_TABLE = "tbleVZb81haFVWqor";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  clientId: string;
  clientName: string;
  status: string;
  mustChangePassword: boolean;
  createdAt: string | null;
  lastLogin: string | null;
}

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

function mapRecord(record: AirtableRecord): User {
  const f = record.fields;
  return {
    id: record.id,
    email: (f["Email"] as string) ?? "",
    passwordHash: (f["Password_Hash"] as string) ?? "",
    name: (f["Name"] as string) ?? "",
    role: (f["Role"] as string) ?? "client_viewer",
    clientId: (f["Client_ID"] as string) ?? "",
    clientName: (f["Client_Name"] as string) ?? "",
    status: (f["Status"] as string) ?? "Active",
    mustChangePassword: (f["Must_Change_Password"] as boolean) ?? false,
    createdAt: (f["Created_At"] as string) ?? null,
    lastLogin: (f["Last_Login"] as string) ?? null,
  };
}

async function airtableGet(url: string): Promise<Response> {
  return fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    cache: "no-store",
  });
}

async function airtablePatch(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

async function airtablePost(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

/**
 * Fetch a single user by email address.
 */
export async function fetchUserByEmail(email: string): Promise<User | null> {
  const formula = encodeURIComponent(`LOWER({Email})="${email.toLowerCase().trim()}"`);
  const res = await airtableGet(
    `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}?filterByFormula=${formula}&maxRecords=1`
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.records || data.records.length === 0) return null;
  return mapRecord(data.records[0]);
}

/**
 * Fetch all users for a given client ID.
 */
export async function fetchUsersByClientId(clientId: string): Promise<User[]> {
  const formula = encodeURIComponent(`{Client_ID}="${clientId}"`);
  const res = await airtableGet(
    `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}?filterByFormula=${formula}&sort[0][field]=Name&sort[0][direction]=asc`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.records ?? []).map(mapRecord);
}

/**
 * Fetch all users (admin only).
 */
export async function fetchAllUsers(): Promise<User[]> {
  const users: User[] = [];
  let offset: string | undefined;
  do {
    const url = `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}?sort[0][field]=Name&sort[0][direction]=asc${offset ? `&offset=${offset}` : ""}`;
    const res = await airtableGet(url);
    if (!res.ok) break;
    const data = await res.json();
    users.push(...(data.records ?? []).map(mapRecord));
    offset = data.offset;
  } while (offset);
  return users;
}

/**
 * Fetch a user by their Airtable record ID.
 */
export async function fetchUserById(id: string): Promise<User | null> {
  const res = await airtableGet(
    `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}/${id}`
  );
  if (!res.ok) return null;
  const data = await res.json();
  return mapRecord(data);
}

/**
 * Create a new user with a bcrypt-hashed password.
 */
export async function createUser(data: {
  email: string;
  password: string;
  name: string;
  role: string;
  clientId?: string;
  clientName?: string;
}): Promise<User> {
  const passwordHash = await bcrypt.hash(data.password, 12);
  const res = await airtablePost(
    `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}`,
    {
      fields: {
        Email: data.email.toLowerCase().trim(),
        Password_Hash: passwordHash,
        Name: data.name,
        Role: data.role,
        Client_ID: data.clientId ?? "",
        Client_Name: data.clientName ?? "",
        Status: "Active",
        Must_Change_Password: true,
        Created_At: new Date().toISOString(),
      },
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create user: ${err}`);
  }
  const record = await res.json();
  return mapRecord(record);
}

/**
 * Update user fields by record ID.
 */
export async function updateUser(
  id: string,
  data: Partial<{
    name: string;
    role: string;
    status: string;
    clientId: string;
    clientName: string;
    passwordHash: string;
    mustChangePassword: boolean;
    lastLogin: string;
  }>
): Promise<User> {
  const fields: Record<string, unknown> = {};
  if (data.name !== undefined) fields["Name"] = data.name;
  if (data.role !== undefined) fields["Role"] = data.role;
  if (data.status !== undefined) fields["Status"] = data.status;
  if (data.clientId !== undefined) fields["Client_ID"] = data.clientId;
  if (data.clientName !== undefined) fields["Client_Name"] = data.clientName;
  if (data.passwordHash !== undefined) fields["Password_Hash"] = data.passwordHash;
  if (data.mustChangePassword !== undefined) fields["Must_Change_Password"] = data.mustChangePassword;
  if (data.lastLogin !== undefined) fields["Last_Login"] = data.lastLogin;

  const res = await airtablePatch(
    `https://api.airtable.com/v0/${BASE_ID}/${USERS_TABLE}/${id}`,
    { fields }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to update user: ${err}`);
  }
  const record = await res.json();
  return mapRecord(record);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Hash a plaintext password.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, 12);
}
