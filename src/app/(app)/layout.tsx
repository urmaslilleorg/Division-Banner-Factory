import Link from "next/link";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import { getUserRole } from "@/lib/auth-role";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getUserRole();
  const clientConfig = getClientConfigFromHeaders();

  const isRootDomain = !clientConfig || clientConfig.id === "demo" || clientConfig.id === "admin";
  const displayName = isRootDomain ? "MENTE" : clientConfig.name;
  const displayLogo = isRootDomain ? null : (clientConfig.logo || null);
  const homeHref = isRootDomain ? "/admin" : "/campaigns?preview=true";

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
            {!isRootDomain && (
              <a href="/campaigns?preview=true" className="hover:text-gray-900 transition-colors">
                Campaigns
              </a>
            )}
            {(isRootDomain ? role === "division_admin" : true) && (
              <a href="/settings" className="hover:text-gray-900 transition-colors">
                Settings
              </a>
            )}
            {isRootDomain && role === "division_admin" && (
              <a href="/admin" className="hover:text-gray-900 transition-colors font-medium">
                Admin
              </a>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
