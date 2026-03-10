import { headers } from "next/headers";
import { ClientConfig } from "@/config/types";
import demoConfig from "@/config/clients/demo";

/**
 * Read client config from request headers (set by middleware).
 * Falls back to demo config if header is missing.
 * Use in server components and API routes only.
 *
 * HTTP headers cannot carry non-ASCII characters directly — Next.js
 * URL-encodes them automatically. We decode once here so all downstream
 * consumers receive the original UTF-8 strings (e.g. "Südameapteek").
 */
export function getClientConfigFromHeaders(): ClientConfig {
  const headersList = headers();
  const configHeader = headersList.get("x-client-config");

  if (configHeader) {
    try {
      // Next.js may URL-encode non-ASCII chars in header values.
      // Decode before JSON.parse so field values like "Südameapteek"
      // are restored from "S%C3%BCdameapteek".
      const raw = configHeader.includes("%") ? decodeURIComponent(configHeader) : configHeader;
      return JSON.parse(raw) as ClientConfig;
    } catch {
      console.error("Failed to parse x-client-config header");
    }
  }

  return demoConfig;
}
