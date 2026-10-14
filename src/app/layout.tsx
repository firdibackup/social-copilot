import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Social Copilot", template: "%s · Social Copilot" },
  description: "Dashboard pribadi untuk menjadwalkan konten dan membalas DM Instagram.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-white font-sans text-zinc-900">{children}</body>
    </html>
  );
}
