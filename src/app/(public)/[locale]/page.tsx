import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";

/**
 * Home PLACEHOLDER (SF-1) — Home thật (7 level cards + 4-step method) là SF-2.
 * Hero trung tính, chỉ để i18n strings + layout acceptance test được.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
        {t("hero.title")}
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        {t("hero.subtitle")}
      </p>
      <p className="text-sm text-muted-foreground">{t("hero.comingSoon")}</p>
    </section>
  );
}
