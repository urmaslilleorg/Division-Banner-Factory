import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { unsealData } from "iron-session";
import { getClientConfig } from "@/config/clients";
import type { SessionData } from "@/lib/auth";

const SESSION_COOKIE_NAME = "mente_session";

/**
 * Routes that do NOT require a session.
 */
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/api/auth/login",
];

/**
 * Path prefixes that are always public (static assets, Figma plugin routes).
 * TODO: add API key auth for plugin routes in a future phase.
 */
const PUBLIC_PREFIXES = [
  "/api/campaigns/",
  "/api/banners/",
  "/api/clients/",
  "/api/image-proxy",
  "/_next/",
  "/fonts/",
  "/logos/",
  "/favicon",
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") || "";
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "localhost:3000";
  const hostWithoutPort = hostname.split(":")[0];
  const domainWithoutPort = appDomain.split(":")[0];

  // Subdomain resolution
  let subdomain: string | null = null;
  if (hostWithoutPort.endsWith(`.${domainWithoutPort}`)) {
    subdomain = hostWithoutPort.replace(`.${domainWithoutPort}`, "");
  } else if (hostWithoutPort.includes(".localhost")) {
    subdomain = hostWithoutPort.split(".localhost")[0];
  }

  // Session reading via iron-session unsealData
  let sessionData: SessionData | null = null;
  const sessionSecret = process.env.SESSION_SECRET;
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (cookieValue && sessionSecret && sessionSecret.length >= 32) {
    try {
      sessionData = await unsealData<SessionData>(cookieValue, {
        password: sessionSecret,
        ttl: 60 * 60 * 24 * 7,
      });
      if (!sessionData?.userId) sessionData = null;
    } catch {
      sessionData = null;
    }
  }

  // Auth gate: redirect unauthenticated users to /login
  if (!isPublicRoute(pathname) && !sessionData) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Build request headers
  const requestHeaders = new Headers(request.headers);

  // Inject session user headers (same pattern as old Clerk headers)
  if (sessionData) {
    requestHeaders.set("x-user-id", sessionData.userId);
    requestHeaders.set("x-user-email", sessionData.email);
    requestHeaders.set("x-user-name", sessionData.name ?? "");
    requestHeaders.set("x-user-role", sessionData.role ?? "viewer");
    requestHeaders.set("x-user-client-id", sessionData.clientId ?? "");
    requestHeaders.set("x-user-client-name", sessionData.clientName ?? "");
  }

  // /admin routes: inject admin client config
  if (pathname.startsWith("/admin")) {
    requestHeaders.set("x-client-id", "admin");
    requestHeaders.set("x-client-config", JSON.stringify({
      id: "admin",
      name: "Division Admin",
      subdomain: "admin",
      logo: "/logos/division.svg",
      colors: { primary: "#111827", secondary: "#374151", accent: "#6366F1", background: "#F9FAFB" },
      languages: ["ET", "EN"],
      airtable: { baseId: "appIqinespXjbIERp", campaignFilter: "" },
      features: { download: true, comments: true, approvals: true, copyEditor: true, designerView: true, campaignBuilder: true },
    }));
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const clientConfig = subdomain ? getClientConfig(subdomain) : null;
  if (subdomain && !clientConfig) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  if (clientConfig) {
    requestHeaders.set("x-client-id", clientConfig.id);
    requestHeaders.set("x-client-config", JSON.stringify(clientConfig));
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
