import { getClientConfigFromHeaders } from "@/lib/client-config";
import ClientLogo from "@/components/client-logo";
import NotificationBadge from "@/components/notification-badge";

// TODO: derive role from Clerk session claims when roles are configured
const userRole = "division_admin";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clientConfig = getClientConfigFromHeaders();

  return (
    <>
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <ClientLogo
              src={clientConfig.logo}
              alt={`${clientConfig.name} logo`}
            />
            <span className="text-lg font-medium text-gray-900">
              {clientConfig.name}
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
              <NotificationBadge userRole={userRole} />
            </a>
            {userRole === "division_admin" && (
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
