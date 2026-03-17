"use client";

import { useState, FormEvent } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  clientId: string;
  clientName: string;
  status: string;
  lastLogin: string | null;
  mustChangePassword: boolean;
}

const ALL_ROLES = [
  "division_admin",
  "division_designer",
  "client_reviewer",
  "client_viewer",
];

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  let pw = "";
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

interface Props {
  initialUsers: User[];
}

export default function AdminUsersClient({ initialUsers }: Props) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [loading, setLoading] = useState(false);

  // Add user form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addRole, setAddRole] = useState("division_designer");
  const [addClientId, setAddClientId] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Reset password
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  // Filter
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("Active");

  async function refreshUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAddUser(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAddSuccess(null);
    setAddSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: addEmail,
          password: addPassword,
          name: addName,
          role: addRole,
          clientId: addClientId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      setAddSuccess(`User created. Temp password: ${addPassword}`);
      setAddName("");
      setAddEmail("");
      setAddPassword("");
      setAddRole("division_designer");
      setAddClientId("");
      setShowAdd(false);
      await refreshUsers();
    } catch (err) {
      setAddError(String(err));
    } finally {
      setAddSaving(false);
    }
  }

  async function handleSaveEdit(id: string) {
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, role: editRole, status: editStatus }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditId(null);
      await refreshUsers();
    } catch (err) {
      alert(String(err));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDisable(id: string) {
    if (!confirm("Disable this user account?")) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      await refreshUsers();
    } catch (err) {
      alert(String(err));
    }
  }

  async function handleResetPassword(id: string) {
    setResetSaving(true);
    setResetSuccess(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetPassword: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset password");
      setResetSuccess(`Done. New temp password: ${resetPassword}`);
      await refreshUsers();
    } catch (err) {
      alert(String(err));
    } finally {
      setResetSaving(false);
    }
  }

  const filteredUsers = users.filter((u) => {
    if (filterRole !== "all" && u.role !== filterRole) return false;
    if (filterStatus !== "all" && u.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex gap-2">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="all">All roles</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="all">All statuses</option>
            <option value="Active">Active</option>
            <option value="Disabled">Disabled</option>
          </select>
          <button
            onClick={refreshUsers}
            disabled={loading}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        <button
          onClick={() => { setShowAdd(!showAdd); setAddError(null); setAddSuccess(null); }}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors"
        >
          + Add user
        </button>
      </div>

      {addSuccess && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          {addSuccess}
        </div>
      )}

      {/* Add user form */}
      {showAdd && (
        <form
          onSubmit={handleAddUser}
          className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3"
        >
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">New user</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                required
                placeholder="Full name"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                required
                placeholder="user@example.com"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role</label>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Client ID (optional)</label>
              <input
                type="text"
                value={addClientId}
                onChange={(e) => setAddClientId(e.target.value)}
                placeholder="recXXXXXXXXXXXXXX"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">
                Password{" "}
                <button
                  type="button"
                  onClick={() => setAddPassword(generatePassword())}
                  className="text-indigo-600 hover:text-indigo-800 underline"
                >
                  Auto-generate
                </button>
              </label>
              <input
                type="text"
                value={addPassword}
                onChange={(e) => setAddPassword(e.target.value)}
                required
                placeholder="Temp password"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
          {addError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
              {addError}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={addSaving}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40"
            >
              {addSaving ? "Creating…" : "Create user"}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Users table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name / Email</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last login</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">
                  No users match the current filters.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className="bg-white hover:bg-gray-50">
                  {editId === user.id ? (
                    <>
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                        />
                        <div className="text-xs text-gray-400 mt-0.5">{user.email}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                        >
                          {ALL_ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{user.clientName || "—"}</td>
                      <td className="px-4 py-2.5">
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          className="rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900"
                        >
                          <option value="Active">Active</option>
                          <option value="Disabled">Disabled</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{formatDate(user.lastLogin)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveEdit(user.id)}
                            disabled={editSaving}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            {editSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : resetId === user.id ? (
                    <>
                      <td colSpan={5} className="px-4 py-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-500">New temp password for {user.name}:</span>
                          <input
                            type="text"
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                            className="rounded border border-gray-200 px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-900 w-48"
                          />
                          <button
                            type="button"
                            onClick={() => setResetPassword(generatePassword())}
                            className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                          >
                            Generate
                          </button>
                          {resetSuccess && (
                            <span className="text-xs text-green-600">{resetSuccess}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleResetPassword(user.id)}
                            disabled={resetSaving || !resetPassword}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            {resetSaving ? "Saving…" : "Set"}
                          </button>
                          <button
                            onClick={() => { setResetId(null); setResetSuccess(null); }}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900">{user.name}</div>
                        <div className="text-xs text-gray-400">{user.email}</div>
                        {user.mustChangePassword && (
                          <span className="inline-block mt-0.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                            Must change password
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">{user.role}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{user.clientName || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block text-xs rounded px-2 py-0.5 font-medium ${
                            user.status === "Active"
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : "bg-gray-100 text-gray-500 border border-gray-200"
                          }`}
                        >
                          {user.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{formatDate(user.lastLogin)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-3 justify-end">
                          <button
                            onClick={() => {
                              setEditId(user.id);
                              setEditName(user.name);
                              setEditRole(user.role);
                              setEditStatus(user.status);
                            }}
                            className="text-xs text-gray-500 hover:text-gray-900"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setResetId(user.id);
                              setResetPassword(generatePassword());
                              setResetSuccess(null);
                            }}
                            className="text-xs text-gray-500 hover:text-gray-900"
                          >
                            Reset pw
                          </button>
                          {user.status === "Active" && (
                            <button
                              onClick={() => handleDisable(user.id)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Disable
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""} shown · {users.length} total
      </p>
    </div>
  );
}
