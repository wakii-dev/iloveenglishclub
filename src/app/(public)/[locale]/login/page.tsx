import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { LoginForm } from "./login-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  // buildPageMetadata (SF-5 QA-401): login là trang public — cần canonical +
  // hreflang cặp + og như mọi route public khác; description theo locale.
  return buildPageMetadata({
    locale,
    path: "/login",
    title: { absolute: t("login.title") },
    description: t("login.description"),
  });
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-16">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">{t("login.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("login.description")}
        </p>
      </div>
      <Suspense>
        <LoginForm locale={locale} googleEnabled={googleEnabled} />
      </Suspense>
    </div>
  );
}
