import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { getClientConfigFromHeaders } from "@/lib/client-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Division Banner Factory",
  description: "White-label banner production platform by Division",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clientConfig = getClientConfigFromHeaders();

  // Inject brand colors as CSS custom properties
  const brandStyles = {
    "--color-primary": clientConfig.colors.primary,
    "--color-secondary": clientConfig.colors.secondary,
    "--color-accent": clientConfig.colors.accent,
    "--color-background": clientConfig.colors.background,
  } as React.CSSProperties;

  return (
    <ClerkProvider>
      <html lang="en" style={{ colorScheme: "light" }}>
        <body className="antialiased bg-white" style={brandStyles}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
