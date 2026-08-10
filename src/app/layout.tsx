import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Cardboardex",
    template: "%s · Cardboardex",
  },
  description: "Browse and manage the trading cards you actually own.",
  applicationName: "Cardboardex",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0d1012",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
