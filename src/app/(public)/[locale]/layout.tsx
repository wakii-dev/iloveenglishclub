import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
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

/**
 * ilec-v2 (Next 16 + cacheComponents): bỏ props `params` + `hasLocale` check +
 * `setRequestLocale` của ilec — locale đọc qua getLocale() (request config giờ
 * resolve qua `rootParams.locale()`, xem src/i18n/request.ts); validate locale
 * lạ (notFound) cũng chuyển vào request config. generateStaticParams giữ
 * nguyên — pre-render cả 2 locale lúc build.
 */
export default async function LocaleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${fontBody.variable} ${fontDisplay.variable} flex min-h-screen flex-col antialiased`}
      >
        {/* timeZone explicit — ilec-v2 (cacheComponents): provider KHÔNG được
            tự infer timezone qua headers() lúc prerender (runtime data → build
            fail). Audience vi/en dùng chung +07. */}
        <NextIntlClientProvider timeZone="Asia/Ho_Chi_Minh">
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
