import { auth } from "@clerk/nextjs/server";
import { getUserRole } from "@/lib/auth-role";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function BannersPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const role = await getUserRole();

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
