"use client";

import Link from "next/link";

export default function LandingHeader() {
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
      <Link
        href="/admin"
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
    </header>
  );
}
