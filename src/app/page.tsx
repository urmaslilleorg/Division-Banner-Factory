"use client";

import { useClerk, useAuth } from "@clerk/nextjs";
import Link from "next/link";

export default function LandingPage() {
  const { openSignIn } = useClerk();
  const { isSignedIn } = useAuth();

  return (
    <div style={{ background: "#0A0A0F", minHeight: "100dvh", overflow: "hidden" }}>
      {/* Animated gradient background */}
      <div className="mente-gradient" />

      {/* Film grain texture overlay */}
      <div className="mente-grain" />

      {/* Fixed header — only shows when already signed in */}
      {isSignedIn && (
        <header
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            gap: "16px",
            padding: "1.5rem 2rem",
          }}
        >
          <Link
            href="/campaigns?preview=true"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 300,
              fontSize: "0.75rem",
              letterSpacing: "0.12em",
              color: "rgba(245,245,240,0.8)",
              textDecoration: "none",
            }}
          >
            Go to app →
          </Link>
        </header>
      )}

      {/* Page content */}
      <main
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          color: "#F5F5F0",
          textAlign: "center",
        }}
      >
        {/* Wordmark */}
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 300,
            fontSize: "clamp(4rem, 12vw, 9rem)",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "#F5F5F0",
            margin: "0 0 0.4rem 0",
            lineHeight: 1,
          }}
        >
          MENTE
        </h1>

        {/* Tagline */}
        <p
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: "1.2rem",
            letterSpacing: "0.05em",
            color: "#F5F5F0",
            opacity: 0.65,
            margin: "0 0 2.5rem 0",
          }}
        >
          Banner production, elevated.
        </p>

        {/* Body lines */}
        <div
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 300,
            fontSize: "1rem",
            lineHeight: 1.85,
            color: "#F5F5F0",
            opacity: 0.5,
            marginBottom: "3rem",
          }}
        >
          <p style={{ margin: 0 }}>From brief to Figma. Copy managed.</p>
          <p style={{ margin: 0 }}>Campaigns delivered.</p>
        </div>

        {/* Sign In button — always rendered, uses imperative Clerk API on click */}
        <button
          className="sign-in-btn"
          onClick={() => openSignIn({ forceRedirectUrl: "/admin" })}
        >
          Sign in
        </button>

        {/* Footer */}
        <footer
          style={{
            position: "fixed",
            bottom: "2rem",
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: "monospace",
            fontSize: "0.7rem",
            letterSpacing: "0.12em",
            color: "#F5F5F0",
            opacity: 0.28,
          }}
        >
          Built by Division&nbsp;&nbsp;·&nbsp;&nbsp;menteproduction.com
        </footer>
      </main>
    </div>
  );
}
