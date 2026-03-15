"use client";

import { useAuth, SignOutButton, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function LandingHeader() {
  // isSignedIn defaults to false when Clerk hasn't loaded (e.g. domain not whitelisted).
  // We always render the appropriate button regardless of Clerk load state.
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  // After Clerk loads and the user is signed in, redirect them to the right place.
  // This handles the post-sign-in case where Clerk redirects back to '/' instead
  // of following forceRedirectUrl (happens when NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL
  // is set to '/' in Vercel env vars, overriding the component-level redirect).
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const role =
      (user?.publicMetadata as { role?: string } | undefined)?.role ??
      (user?.unsafeMetadata as { role?: string } | undefined)?.role ??
      "viewer";
    const dest = role === "division_admin" ? "/admin" : "/campaigns?preview=true";
    router.replace(dest);
  }, [isLoaded, isSignedIn, user, router]);

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "1.5rem 2rem",
        background: "transparent",
      }}
    >
      {/* Auth controls — only show when signed in */}
      {isSignedIn && (
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link
            href="/campaigns?preview=true"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize: "0.75rem",
              letterSpacing: "0.12em",
              color: "rgba(245, 245, 240, 0.8)",
              textDecoration: "none",
            }}
          >
            Go to app →
          </Link>
          <SignOutButton redirectUrl="/">
            <button
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(245, 245, 240, 0.4)",
                fontSize: "0.75rem",
                cursor: "pointer",
                letterSpacing: "0.1em",
                fontFamily: "'DM Sans', sans-serif",
                textTransform: "uppercase",
                padding: 0,
              }}
            >
              SIGN OUT
            </button>
          </SignOutButton>
        </div>
      )}
    </header>
  );
}
