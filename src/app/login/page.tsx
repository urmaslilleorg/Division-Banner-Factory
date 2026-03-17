"use client";

import { useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Change-password state
  const [mustChange, setMustChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  // Stored role/clientId from login response for redirect
  const [loginRole, setLoginRole] = useState<string | null>(null);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      if (data.mustChangePassword) {
        setCurrentPassword(password);
        setMustChange(true);
        setLoginRole(data.role ?? null);
        return;
      }
      redirectAfterLogin(data.role);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setChangeError(null);
    if (newPassword !== confirmPassword) {
      setChangeError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setChangeError("New password must be at least 8 characters");
      return;
    }
    setChanging(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChangeError(data.error || "Failed to change password");
        return;
      }
      redirectAfterLogin(loginRole);
    } catch {
      setChangeError("Network error. Please try again.");
    } finally {
      setChanging(false);
    }
  }

  function redirectAfterLogin(role: string | null) {
    if (nextPath && nextPath !== "/login") {
      router.push(nextPath);
      return;
    }
    if (role === "division_admin") {
      router.push("/admin");
    } else if (role === "division_designer") {
      router.push("/campaigns");
    } else {
      // client_reviewer / client_viewer
      router.push("/campaigns?preview=true");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(245,245,240,0.06)",
    border: "1px solid rgba(245,245,240,0.2)",
    borderRadius: "2px",
    padding: "0.75rem 1rem",
    color: "#F5F5F0",
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 300,
    fontSize: "0.9rem",
    letterSpacing: "0.02em",
    outline: "none",
    transition: "border-color 200ms",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: "monospace",
    fontSize: "0.65rem",
    letterSpacing: "0.15em",
    textTransform: "uppercase" as const,
    color: "rgba(245,245,240,0.45)",
    marginBottom: "0.4rem",
  };

  return (
    <div
      style={{
        background: "#0A0A0F",
        minHeight: "100dvh",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div className="mente-gradient" />
      <div className="mente-grain" />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: "380px",
          textAlign: "center",
        }}
      >
        {/* MENTE wordmark */}
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 300,
            fontSize: "clamp(2.5rem, 8vw, 4rem)",
            letterSpacing: "0.35em",
            textTransform: "uppercase",
            color: "#F5F5F0",
            margin: "0 0 0.25rem 0",
            lineHeight: 1,
          }}
        >
          MENTE
        </h1>
        <p
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: "0.9rem",
            letterSpacing: "0.05em",
            color: "#F5F5F0",
            opacity: 0.45,
            margin: "0 0 2.5rem 0",
          }}
        >
          Banner production, elevated.
        </p>

        {/* Login form */}
        {!mustChange ? (
          <form onSubmit={handleLogin} style={{ textAlign: "left" }}>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                style={inputStyle}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(245,245,240,0.5)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(245,245,240,0.2)")
                }
              />
            </div>
            <div style={{ marginBottom: "1.75rem" }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                style={inputStyle}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(245,245,240,0.5)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(245,245,240,0.2)")
                }
              />
            </div>

            {error && (
              <div
                style={{
                  marginBottom: "1.25rem",
                  padding: "0.65rem 0.9rem",
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "2px",
                  color: "#fca5a5",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "0.8rem",
                  letterSpacing: "0.02em",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="sign-in-btn"
              style={{ width: "100%", opacity: loading ? 0.6 : 1 }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : (
          /* Change password form */
          <form onSubmit={handleChangePassword} style={{ textAlign: "left" }}>
            <div
              style={{
                marginBottom: "1.5rem",
                padding: "0.75rem 1rem",
                background: "rgba(251,191,36,0.08)",
                border: "1px solid rgba(251,191,36,0.25)",
                borderRadius: "2px",
                color: "#fde68a",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "0.8rem",
                letterSpacing: "0.02em",
                lineHeight: 1.6,
              }}
            >
              Your account requires a password change before continuing.
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={labelStyle}>New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                style={inputStyle}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(245,245,240,0.5)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(245,245,240,0.2)")
                }
              />
            </div>
            <div style={{ marginBottom: "1.75rem" }}>
              <label style={labelStyle}>Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                style={inputStyle}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(245,245,240,0.5)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(245,245,240,0.2)")
                }
              />
            </div>

            {changeError && (
              <div
                style={{
                  marginBottom: "1.25rem",
                  padding: "0.65rem 0.9rem",
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "2px",
                  color: "#fca5a5",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "0.8rem",
                  letterSpacing: "0.02em",
                }}
              >
                {changeError}
              </div>
            )}

            <button
              type="submit"
              disabled={changing}
              className="sign-in-btn"
              style={{ width: "100%", opacity: changing ? 0.6 : 1 }}
            >
              {changing ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}

        <footer
          style={{
            marginTop: "3rem",
            fontFamily: "monospace",
            fontSize: "0.65rem",
            letterSpacing: "0.12em",
            color: "#F5F5F0",
            opacity: 0.22,
          }}
        >
          Built by Division&nbsp;&nbsp;·&nbsp;&nbsp;menteproduction.com
        </footer>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
