import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import LandingHeader from "@/components/landing-header";
import { SignInButton } from "@clerk/nextjs";

export default async function LandingPage() {
  const headersList = headers();
  const clientId = headersList.get("x-client-id");
  const isClientSubdomain = !!clientId && clientId !== "admin";

  // Auth check — redirect signed-in users to the right place
  const { userId, sessionClaims } = await auth();
  if (userId) {
    if (isClientSubdomain) {
      // Client subdomain: go to campaign calendar
      redirect("/campaigns?preview=true");
    } else {
      // Root domain: division_admin → /admin, everyone else → /campaigns
      const role =
        (sessionClaims?.metadata as { role?: string })?.role ??
        (sessionClaims?.publicMetadata as { role?: string })?.role ??
        "viewer";
      redirect(role === "division_admin" ? "/admin" : "/campaigns?preview=true");
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400&display=swap');

        html, body { margin: 0; padding: 0; background: #0A0A0F; overflow: hidden; }

        @keyframes pulse-bg {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }

        @keyframes grain {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-1%, -1%); }
          20% { transform: translate(1%, 1%); }
          30% { transform: translate(-1%, 1%); }
          40% { transform: translate(1%, -1%); }
          50% { transform: translate(-1%, 0); }
          60% { transform: translate(1%, 0); }
          70% { transform: translate(0, 1%); }
          80% { transform: translate(0, -1%); }
          90% { transform: translate(-1%, 1%); }
        }

        .mente-grain::before {
          content: '';
          position: fixed;
          inset: -50%;
          width: 200%;
          height: 200%;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
          opacity: 0.028;
          animation: grain 8s steps(1) infinite;
          pointer-events: none;
          z-index: 1;
        }

        .mente-gradient {
          position: fixed;
          inset: 0;
          background: radial-gradient(ellipse 80% 60% at 50% 40%, #1a1025 0%, #0A0A0F 60%, #060608 100%);
          animation: pulse-bg 14s ease-in-out infinite;
          z-index: 0;
        }

        .sign-in-btn {
          font-family: 'DM Sans', sans-serif;
          font-weight: 300;
          font-size: 0.8125rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #F5F5F0;
          background: transparent;
          border: 1px solid rgba(245, 245, 240, 0.35);
          padding: 0.8rem 2.8rem;
          cursor: pointer;
          transition: background 200ms ease, color 200ms ease, border-color 200ms ease;
        }

        .sign-in-btn:hover {
          background: #F5F5F0;
          color: #0A0A0F;
          border-color: #F5F5F0;
        }

        @media (max-width: 640px) {
          html, body { overflow: auto; }
        }
      `}</style>

      {/* Animated gradient background */}
      <div className="mente-gradient" />

      {/* Film grain texture overlay */}
      <div className="mente-grain" />

      {/* Minimal fixed transparent header — client component handles Clerk auth state */}
      <LandingHeader />

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

        {/* Centre Sign In button */}
        <SignInButton mode="modal" forceRedirectUrl="/campaigns">
          <button className="sign-in-btn">Sign in</button>
        </SignInButton>

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
    </>
  );
}
