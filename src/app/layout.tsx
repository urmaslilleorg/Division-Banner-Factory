import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import ClientLogo from "@/components/client-logo";
import NotificationBadge from "@/components/notification-badge";
import "./globals.css";

export const metadata: Metadata = {
  title: "Division Banner Factory",
  description: "White-label banner production platform by Division",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clientConfig = getClientConfigFromHeaders();

  // Inject brand colors as CSS custom properties
  const brandStyles = {
    "--color-primary": clientConfig.colors.primary,
    "--color-secondary": clientConfig.colors.secondary,
    "--color-accent": clientConfig.colors.accent,
    "--color-background": clientConfig.colors.background,
  } as React.CSSProperties;

  // TODO: derive role from Clerk session claims when roles are configured
  const userRole = "division_admin";

  return (
    <ClerkProvider>
      <html lang="en">
        <body className="antialiased" style={brandStyles}>
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
                <a href="/" className="hover:text-gray-900 transition-colors">
                  Campaigns
                </a>
                <a
                  href="/banners"
                  className="relative flex items-center gap-1.5 hover:text-gray-900 transition-colors"
                >
                  Banners
                  <NotificationBadge userRole={userRole} />
                </a>
                {/* Settings — visible to division_admin only */}
                {userRole === "division_admin" && (
                  <a href="/settings" className="hover:text-gray-900 transition-colors">
                    Settings
                  </a>
                )}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
