import { auth } from "@clerk/nextjs/server";
import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import NotificationBadge from "@/components/notification-badge";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get Clerk session — treat missing role as least-privilege viewer, never crash
  const { sessionClaims } = await auth();
  // Check metadata (Clerk custom claim) first, fall back to publicMetadata, then 'viewer'
  const role =
    (sessionClaims?.metadata as { role?: string })?.role ??
    (sessionClaims?.publicMetadata as { role?: string })?.role ??
    "viewer";

  // Client config may be null on root domain (Division admin context)
  const clientConfig = getClientConfigFromHeaders();

  // On root domain, clientConfig falls back to demo config from getClientConfigFromHeaders().
  // We show "MENTE" as the brand name when no real client config is present.
  const isRootDomain = !clientConfig || clientConfig.id === "demo";
  const displayName = isRootDomain ? "MENTE" : clientConfig.name;
  const displayLogo = isRootDomain ? null : clientConfig.logo;

  // Logo/name links to /campaigns on client subdomains, /admin on root domain
  const homeHref = isRootDomain ? "/admin" : "/campaigns";

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link
            href={homeHref}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            {displayLogo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={displayLogo}
                alt={`${displayName} logo`}
                className="h-8 w-auto object-contain"
              />
            ) : (
              <span className="text-lg font-medium text-gray-900">
                {displayName}
              </span>
            )}
          </Link>

          <nav className="flex items-center gap-6 text-sm text-gray-600">
            {/* Client subdomain: show Campaigns + Banners */}
            {!isRootDomain && (
              <>
                <a href="/campaigns" className="hover:text-gray-900 transition-colors">
                  Campaigns
                </a>
                <a
                  href="/banners"
                  className="relative flex items-center gap-1.5 hover:text-gray-900 transition-colors"
                >
                  Banners
                  <NotificationBadge userRole={role} />
                </a>
              </>
            )}
            {/* Settings: visible on both domains for admin; on client subdomain for all roles */}
            {(isRootDomain ? role === "division_admin" : true) && (
              <a href="/settings" className="hover:text-gray-900 transition-colors">
                Settings
              </a>
            )}
            {/* Admin: root domain only, admin role only */}
            {isRootDomain && role === "division_admin" && (
              <a href="/admin" className="hover:text-gray-900 transition-colors font-medium">
                Admin
              </a>
            )}
            {/* Sign out — always visible for any authenticated user */}
            <SignOutButton redirectUrl="/">
              <button className="text-gray-400 hover:text-gray-600 transition-colors text-xs tracking-widest uppercase">
                Sign out
              </button>
            </SignOutButton>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
