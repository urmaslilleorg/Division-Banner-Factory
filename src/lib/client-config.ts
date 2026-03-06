import { headers } from "next/headers";
import { ClientConfig } from "@/config/types";
import demoConfig from "@/config/clients/demo";

/**
 * Read client config from request headers (set by middleware).
 * Falls back to demo config if header is missing.
 * Use in server components and API routes only.
 */
export function getClientConfigFromHeaders(): ClientConfig {
  const headersList = headers();
  const configHeader = headersList.get("x-client-config");

  if (configHeader) {
    try {
      return JSON.parse(configHeader) as ClientConfig;
    } catch {
      console.error("Failed to parse x-client-config header");
    }
  }

  return demoConfig;
}
