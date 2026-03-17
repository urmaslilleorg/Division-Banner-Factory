export const dynamic = "force-dynamic";

import { fetchAllUsers } from "@/lib/users";
import { headers } from "next/headers";
import { getUser } from "@/lib/get-user";
import { redirect } from "next/navigation";
import Link from "next/link";
import AdminUsersClient from "@/components/admin/admin-users-client";

export default async function AdminUsersPage() {
  const hdrs = await headers();
  const user = getUser(hdrs);

  if (!user || user.role !== "division_admin") {
    redirect("/login");
  }

  const users = await fetchAllUsers();

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Admin
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-light text-gray-900">Users</h1>
        <p className="text-sm text-gray-500 mt-1">
          All user accounts across all clients. Division admin and designer accounts are managed here.
        </p>
      </div>

      <AdminUsersClient initialUsers={users} />
    </div>
  );
}
