import type { Metadata } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";

export const metadata: Metadata = {
  title: "Docentenplanner",
  description: "Dashboard voor docenten",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" className="h-full">
      <body className="h-full bg-[#f0f4f8]" style={{ display: 'flex', flexDirection: 'column', margin: 0 }}>
        <Navigation />
        <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>
      </body>
    </html>
  );
}
