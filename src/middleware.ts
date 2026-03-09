import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClientConfig } from "@/config/clients";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
]);

// /admin/* routes require division_admin role
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

export default clerkMiddleware((auth, request: NextRequest) => {
  // /admin routes: protect with Clerk auth, inject admin client config
  if (isAdminRoute(request)) {
    if (!isPublicRoute(request)) {
      auth().protect();
    }
    const requestHeaders = new Headers(request.headers);
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

  const hostname = request.headers.get("host") || "";
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "localhost:3000";

  // Extract subdomain from hostname
  // e.g. "avene.bannerfactory.division.ee" → "avene"
  // For local dev: "avene.localhost:3000" → "avene"
  let subdomain = "demo";

  if (hostname !== appDomain && hostname !== `www.${appDomain}`) {
    const hostWithoutPort = hostname.split(":")[0];
    const domainWithoutPort = appDomain.split(":")[0];

    if (hostWithoutPort.endsWith(`.${domainWithoutPort}`)) {
      subdomain = hostWithoutPort.replace(`.${domainWithoutPort}`, "");
    } else if (hostWithoutPort.includes(".localhost")) {
      subdomain = hostWithoutPort.split(".localhost")[0];
    }
  }

  // Look up client config (static files only — dynamic Airtable lookup happens in pages)
  const clientConfig = getClientConfig(subdomain);

  if (!clientConfig) {
    // Allow API routes through without a client config
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  // Protect non-public routes — redirect unauthenticated users to landing page
  if (!isPublicRoute(request)) {
    auth().protect({ unauthenticatedUrl: new URL("/", request.url).toString() });
  }

  // Attach client config to request headers for downstream use
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-client-id", clientConfig.id);
  requestHeaders.set("x-client-config", JSON.stringify(clientConfig));

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
