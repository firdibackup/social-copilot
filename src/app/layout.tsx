import { getTranslations } from 'next-intl/server'
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { DialogHost } from "@/components/confirm-dialog";
import { Suspense } from "react";
import { getUserLocale } from "@/i18n/locale";
import { IntlMessages } from "@/i18n/client-messages";
import "./globals.css";

/** The brand face, for headings only; body and UI text use the system (San Francisco) stack in globals.css. */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell');
  return {
  title: { default: "Carousely", template: "%s · Carousely" },
  description: t('description'),
  };
}

export const viewport: Viewport = {
  themeColor: "#f8f8fc",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // The cookie-dependent document must sit below Suspense with Cache Components.
  return <Suspense fallback={null}><LocalizedDocument>{children}</LocalizedDocument></Suspense>;
}

async function LocalizedDocument({ children }: Pick<LayoutProps<"/">, "children">) {
  const locale = await getUserLocale();

  return (
    <html lang={locale} className={`${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full bg-white font-sans text-ink" suppressHydrationWarning>
        {/* Wrap larger client islands in <IntlMessages namespaces={['common', 'landing']}>;
            only common + shell are sent to the browser at the root. */}
        <IntlMessages namespaces={['common', 'shell']}>
          {children}
          <DialogHost />
        </IntlMessages>
      </body>
    </html>
  );
}
