import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sharebook Phase 0A",
  description: "AI concept bench for save intent extraction."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
