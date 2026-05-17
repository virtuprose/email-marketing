import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Virtuprose AI Email Sales Agent",
  description: "Internal lead, offer, and compliance foundation for Virtuprose outreach."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
