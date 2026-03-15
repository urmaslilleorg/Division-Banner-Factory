import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Division Banner Factory",
  description: "White-label banner production platform by Division",
};

// Root layout must be a pure static shell — no server-side header reads here.
// Reading request headers (getClientConfigFromHeaders) causes a server/client
// mismatch during hydration, triggering React errors #418/#423/#425 which
// crash the Clerk modal. Brand color injection is handled by the (app) layout.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" style={{ colorScheme: "light" }}>
        <body className="antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
