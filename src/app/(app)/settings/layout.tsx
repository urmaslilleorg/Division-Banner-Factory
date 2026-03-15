import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getClientConfigFromHeaders } from "@/lib/client-config";
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  const role = (sessionClaims?.metadata as Record<string, string> | undefined)?.role;
  const isAdmin = role === "division_admin";

  // Detect client subdomain context
  const clientConfig = getClientConfigFromHeaders();
  const isClientSubdomain =
    clientConfig &&
    clientConfig.id !== "demo" &&
    clientConfig.id !== "admin";

  // Client subdomain users can only access /settings/templates
  // Root domain non-admin users are redirected away
  if (!isAdmin && !isClientSubdomain) {
    redirect("/");
  }

  // Admin sees all tabs; client users see Templates only
  const tabs = [
    ...(isAdmin ? [
      { href: "/settings/formats", label: "Formats" },
      { href: "/settings/variables", label: "Variables" },
    ] : []),
    { href: "/settings/templates", label: "Templates" },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-light text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          {isAdmin
            ? "Manage formats, variables, and platform configuration."
            : "Manage your saved campaign templates."}
        </p>
      </div>

      {/* Tab navigation */}
      <nav className="mb-6 flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="relative px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors
              [&.active]:text-gray-900 [&.active]:after:absolute [&.active]:after:bottom-0 [&.active]:after:left-0
              [&.active]:after:right-0 [&.active]:after:h-0.5 [&.active]:after:bg-gray-900"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {children}
    </main>
  );
}
