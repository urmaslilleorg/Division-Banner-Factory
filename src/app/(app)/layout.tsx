import { auth } from "@clerk/nextjs/server";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import ClientLogo from "@/components/client-logo";
import NotificationBadge from "@/components/notification-badge";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get Clerk session to derive role
  const { sessionClaims } = await auth();
  const role = (sessionClaims?.publicMetadata as { role?: string })?.role ?? "division_designer";

  // Client config may be null on root domain (Division admin context)
  const clientConfig = getClientConfigFromHeaders();

  // On root domain, clientConfig falls back to demo config from getClientConfigFromHeaders().
  // We show "MENTE" as the brand name when no real client config is present.
  const isRootDomain = !clientConfig || clientConfig.id === "demo";
  const displayName = isRootDomain ? "MENTE" : clientConfig.name;
  const displayLogo = isRootDomain ? null : clientConfig.logo;

  return (
    <>
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            {displayLogo && (
              <ClientLogo
                src={displayLogo}
                alt={`${displayName} logo`}
              />
            )}
            <span className="text-lg font-medium text-gray-900">
              {displayName}
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-gray-600">
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
            {role === "division_admin" && (
              <>
                <a href="/settings" className="hover:text-gray-900 transition-colors">
                  Settings
                </a>
                <a href="/admin" className="hover:text-gray-900 transition-colors font-medium">
                  Admin
                </a>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </>
  );
}
