import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function BannersPage() {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  const role =
    (sessionClaims?.metadata as { role?: string })?.role ??
    (sessionClaims?.publicMetadata as { role?: string })?.role ??
    "viewer";

  // Detect root domain vs client subdomain (same pattern as campaigns/page.tsx)
  const headersList = headers();
  const clientId = headersList.get("x-client-id");
  const isRootDomain = !clientId || clientId === "admin";

  if (isRootDomain) {
    if (role === "division_admin") {
      redirect("/admin");
    } else {
      redirect("/");
    }
  }

  // Client subdomains: banners are accessed through their parent campaign
  redirect("/campaigns");
}
