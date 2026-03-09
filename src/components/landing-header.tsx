"use client";

import { useAuth } from "@clerk/nextjs";
import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";

export default function LandingHeader() {
  const { isLoaded, isSignedIn } = useAuth();

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

      {/* Auth button — only render after Clerk has loaded to avoid flicker */}
      {isLoaded && (
        isSignedIn ? (
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
        )
      )}
    </header>
  );
}
