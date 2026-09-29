import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { ArrowRight, BookOpen } from "lucide-react";
import { LevelCard } from "@/components/content/level-card";
import { MethodGrid } from "@/components/content/method-grid";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Link } from "@/i18n/navigation";
import { getBooks } from "@/lib/content/queries";

/**
 * Home thật (SF-2) — §2.3: hero split + LevelPath 7 cards + MethodGrid 2×2.
 * HeroVisual = 2 mini-card minh họa (decorative, aria-hidden — mock của
 * prototype b.html; data thật về tiến độ là SF-6). SSG + revalidate 300.
 */
export const revalidate = 300;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const books = await getBooks(locale);
  const totalLessons = books.reduce((sum, b) => sum + b.lessonCount, 0);

  return (
    <div className="mx-auto max-w-[1120px] px-6">
      {/* Hero — grid 1.1fr_0.9fr, pt-14 pb-[60px] theo hand-off §1.5 */}
      <section className="grid grid-cols-1 gap-12 pt-14 pb-[60px] lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-secondary">
            {t("hero.kicker")}
          </p>
          <h1 className="mt-3 font-display text-[33px] leading-[1.15] font-bold tracking-tight lg:text-[52px]">
            {t("hero.title")}
          </h1>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed font-semibold text-muted-foreground">
            {t("hero.subtitle")}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              asChild
              className="rounded-[14px] text-[15px] font-extrabold shadow-[0_4px_0_var(--primary-deep)] transition-[transform,box-shadow] duration-[80ms] hover:brightness-105 active:translate-y-[3px] active:shadow-[0_1px_0_var(--primary-deep)]"
            >
              <Link href="/books">
                {t("hero.ctaPrimary")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="ghost"
              asChild
              className="rounded-[14px] text-[15px] font-extrabold"
            >
              <Link href="/books/level-1">{t("hero.ctaSecondary")}</Link>
            </Button>
          </div>
          <p className="mt-6 text-[13.5px] font-bold text-muted-foreground tabular-nums">
            {t("hero.trustLevels")} · {t("hero.trustLessons", { count: totalLessons })} ·{" "}
            {t("hero.trustFree")}
          </p>
        </div>

        {/* HeroVisual — minh họa tĩnh (prototype b.html), không fake user data */}
        <div aria-hidden className="hidden rotate-[1.5deg] lg:block">
          <div className="rounded-[18px] border-2 border-border bg-card p-5 shadow-[0_12px_28px_-16px_color-mix(in_srgb,var(--primary-deep)_40%,transparent)]">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-secondary/15 text-secondary">
                <BookOpen className="size-[18px]" />
              </span>
              <div>
                <p className="text-[13px] font-extrabold">{t("hero.miniCard1Title")}</p>
                <p className="text-[12.5px] text-muted-foreground">{t("hero.miniCard1Sub")}</p>
              </div>
            </div>
            <Progress
              value={35}
              className="mt-4 h-2.5 rounded-full border-2 border-border bg-muted [&>[data-slot=progress-indicator]]:bg-secondary"
            />
            <p className="mt-2 text-[12px] font-bold text-muted-foreground tabular-nums">
              {t("hero.miniCard1Meta")}
            </p>
          </div>
          <div className="mt-4 ml-[18px] rotate-[-2deg] rounded-[18px] border-2 border-border bg-card p-5 shadow-[0_12px_28px_-16px_color-mix(in_srgb,var(--primary-deep)_40%,transparent)]">
            <p className="text-[13px] font-extrabold">{t("hero.miniCard2Title")}</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">{t("hero.miniCard2Sub")}</p>
          </div>
        </div>
      </section>

      {/* LevelPath — rail scroll ngang + đường nối dashed (§2.3) */}
      <section className="border-t-2 py-[44px]">
        <h2 className="font-display text-[28px] font-bold">{t("levels.title")}</h2>
        <p className="mt-1.5 text-[15px] font-semibold text-muted-foreground">
          {t("levels.subtitle")}
        </p>
        <div className="relative mt-8">
          <div aria-hidden className="absolute top-16 right-0 left-0 border-t-[3px] border-dashed border-border" />
          <div className="relative flex gap-[18px] overflow-x-auto pb-2">
            {books.map((book) => (
              <LevelCard key={book.slug} book={book} />
            ))}
          </div>
        </div>
      </section>

      {/* Method — 4 bước truyền thông trên landing (§2.3) */}
      <section id="method" className="border-t-2 py-[44px]">
        <h2 className="text-center font-display text-[28px] font-bold">{t("method.title")}</h2>
        <p className="mt-1.5 mb-8 text-center text-[15px] font-semibold text-muted-foreground">
          {t("method.subtitle")}
        </p>
        <MethodGrid />
      </section>
    </div>
  );
}
