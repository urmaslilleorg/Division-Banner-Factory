"use client";

import { useAuth, SignInButton } from "@clerk/nextjs";
import Link from "next/link";

export default function LandingHeader() {
  // isLoaded will be false if Clerk hasn't initialised (e.g. domain not whitelisted).
  // We show the Sign In button regardless — it will work once Clerk loads.
  // If signed in, we show "Go to app →" instead.
  const { isSignedIn } = useAuth();

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
        justifyContent: "space-between",
        padding: "1.5rem 2rem",
        background: "transparent",
      }}
    >
      {/* MENTE wordmark */}
      <Link
        href="/"
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 300,
          fontSize: "1rem",
          letterSpacing: "0.3em",
          textTransform: "uppercase",
          color: "#F5F5F0",
          textDecoration: "none",
        }}
      >
        MENTE
      </Link>

      {/* Show "Go to app" when signed in, otherwise always show Sign In */}
      {isSignedIn ? (
        <Link
          href="/campaigns"
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
      ) : (
        <SignInButton mode="modal" forceRedirectUrl="/campaigns">
          <button
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize: "0.75rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "rgba(245, 245, 240, 0.9)",
              background: "transparent",
              border: "1px solid rgba(245, 245, 240, 0.4)",
              padding: "0.4rem 1.2rem",
              cursor: "pointer",
            }}
          >
            Sign In
          </button>
        </SignInButton>
      )}
    </header>
  );
}
