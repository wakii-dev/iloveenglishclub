import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Providers } from "@/components/providers";
import { fontBody, fontDisplay } from "@/lib/fonts";
import { routing } from "@/i18n/routing";
import "../../globals.css";

export const metadata: Metadata = {
  title: {
    default: "I Love English Club",
    template: "%s · I Love English Club",
  },
  description:
    "English dictation practice following the Cambridge English Prepare path — from Pre-A1 to B2 First.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${fontBody.variable} ${fontDisplay.variable} flex min-h-screen flex-col antialiased`}
      >
        <NextIntlClientProvider>
          <Providers>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
