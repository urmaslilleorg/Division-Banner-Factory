import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getClientConfig } from "@/config/clients";

export default function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "localhost:3000";

  const hostWithoutPort = hostname.split(":")[0];
  const domainWithoutPort = appDomain.split(":")[0];

  let subdomain: string | null = null;

  if (hostWithoutPort.endsWith(`.${domainWithoutPort}`)) {
    subdomain = hostWithoutPort.replace(`.${domainWithoutPort}`, "");
  } else if (hostWithoutPort.includes(".localhost")) {
    subdomain = hostWithoutPort.split(".localhost")[0];
  }

  // /admin routes: inject admin client config
  if (request.nextUrl.pathname.startsWith("/admin")) {
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

  const clientConfig = subdomain ? getClientConfig(subdomain) : null;

  if (subdomain && !clientConfig) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Unknown client" }, { status: 404 });
  }

  const requestHeaders = new Headers(request.headers);
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
