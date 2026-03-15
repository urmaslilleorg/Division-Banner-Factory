import type { Metadata } from "next";
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
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
