import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CrewUp | Construction Marketplace Demo",
  description:
    "A production-minded marketplace demo connecting general contractors with qualified subcontractors.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
