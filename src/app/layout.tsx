import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { DialogHost } from "@/components/confirm-dialog";
import "./globals.css";

/** The brand face, for headings only; body and UI text use the system (San Francisco) stack in globals.css. */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Carousely", template: "%s · Carousely" },
  description: "Jadwalkan konten, buat draf dengan AI, dan balas DM Instagram dari satu tempat.",
};

export const viewport: Viewport = {
  themeColor: "#f8f8fc",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full bg-white font-sans text-ink" suppressHydrationWarning>
        {children}
        <DialogHost />
      </body>
    </html>
  );
}
