import { getUserRole } from "@/lib/auth-role";
import { redirect } from "next/navigation";
import { getClientConfigFromHeaders } from "@/lib/client-config";

/**
 * Layout for /settings on client subdomains.
 * The new settings page is a self-contained tabbed component; this layout
 * only handles auth-gating and the outer page wrapper.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = "mock-user-id";
  if (!userId) redirect("/sign-in");
  const role = await getUserRole();
  const isAdmin = role === "division_admin";

  // Detect client subdomain context
  const clientConfig = getClientConfigFromHeaders();
  const isClientSubdomain =
    clientConfig &&
    clientConfig.id !== "demo" &&
    clientConfig.id !== "admin";

  // Root domain non-admin users have nothing to see here
  if (!isAdmin && !isClientSubdomain) {
    redirect("/");
  }

  // On the root domain, admin should go to /admin (no global settings page yet)
  if (!isClientSubdomain && isAdmin) {
    redirect("/admin");
  }

  return <>{children}</>;
}
