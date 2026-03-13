import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  // Only division_admin can access settings
  const role = (sessionClaims?.metadata as Record<string, string> | undefined)?.role;
  if (role !== "division_admin") {
    redirect("/");
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-light text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage formats, variables, and platform configuration.</p>
      </div>

      {/* Tab navigation */}
      <nav className="mb-6 flex gap-1 border-b border-gray-200">
        {[
          { href: "/settings/formats", label: "Formats" },
          { href: "/settings/variables", label: "Variables" },
          { href: "/settings/templates", label: "Templates" },
        ].map((tab) => (
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
