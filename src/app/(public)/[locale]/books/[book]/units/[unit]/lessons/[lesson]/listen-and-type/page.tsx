import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { ChevronLeft, Play } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getBook, getLesson, getUnit } from "@/lib/content/queries";
import { resolveAudioUrl } from "@/lib/storage";

/**
 * Placeholder lesson (SF-2) — route contract cố định theo spec §3; SF-4 thay
 * component player vào đúng URL này. Hiện tại: title + số câu + CTA link mù
 * (disabled, note "next release") + audio demo phát được khi part có audio.
 * ISR on-demand: KHÔNG prerender hàng nghìn lesson × 2 locale lúc build (§3).
 */
export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; book: string; unit: string; lesson: string }>;
}): Promise<Metadata> {
  const { locale, book, unit, lesson } = await params;
  const row = await getLesson(book, unit, lesson, locale);
  return { title: row?.title ?? "Lesson" };
}

export default async function LessonPlaceholderPage({
  params,
}: {
  params: Promise<{ locale: string; book: string; unit: string; lesson: string }>;
}) {
  const { locale, book: bookSlug, unit, lesson } = await params;
  setRequestLocale(locale);
  const [t, book, unitRow, lessonRow] = await Promise.all([
    getTranslations("lesson"),
    getBook(bookSlug, locale),
    getUnit(bookSlug, unit, locale),
    getLesson(bookSlug, unit, lesson, locale),
  ]);
  if (!lessonRow || !unitRow || !book) notFound();

  const demoPart = lessonRow.parts.find((p) => p.audioPath !== null) ?? null;

  return (
    <div className="mx-auto max-w-[820px] px-6 py-12">
      <nav aria-label="breadcrumb" className="text-[13.5px] font-bold">
        <Link
          href={`/books/${bookSlug}`}
          className="text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {book.title}
        </Link>
        <span aria-hidden className="mx-2 text-muted-foreground/60">/</span>
        <Link
          href={`/books/${bookSlug}/units/${unit}`}
          className="text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {unitRow.title}
        </Link>
      </nav>

      <p className="mt-4 text-[13px] font-extrabold uppercase tracking-[0.08em] text-secondary tabular-nums">
        {book.cefrLabel} · Unit {unitRow.number} · {t("placeholder.vocabLevel")}{" "}
        {lessonRow.vocabLevel}
      </p>
      <h1 className="mt-2 font-display text-[33px] leading-tight font-bold tracking-tight">
        {lessonRow.title}
      </h1>
      <p className="mt-2 text-[15px] font-semibold text-muted-foreground tabular-nums">
        {t("placeholder.parts", { count: lessonRow.parts.length })}
      </p>

      {/* Audio demo — bấm play ra tiếng (nền gate SF-4); tone tự sinh */}
      {demoPart?.audioPath ? (
        <div className="mt-6 rounded-[18px] border-2 border-border bg-card p-5">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
            {t("placeholder.audioDemoLabel")}
          </p>
          <audio
            controls
            preload="none"
            src={resolveAudioUrl(demoPart.audioPath)}
            className="mt-3 w-full"
          >
            <track kind="captions" />
          </audio>
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            {t("placeholder.audioDemoNote")}
          </p>
        </div>
      ) : null}

      {/* Link mù — player là SF-4; CTA disabled đúng prototype state START */}
      <div className="mt-7 rounded-[18px] border-2 border-dashed border-border bg-card p-6 text-center">
        <span
          aria-disabled="true"
          role="button"
          title={t("placeholder.ctaSoon")}
          className="inline-flex cursor-not-allowed items-center gap-2 rounded-[14px] bg-primary px-6 py-3 font-display text-[15.5px] font-bold text-primary-foreground opacity-60 shadow-[0_4px_0_var(--primary-deep)]"
        >
          <Play aria-hidden className="size-[18px] fill-current" />
          {t("placeholder.ctaDisabled")}
        </span>
        <p className="mt-3 text-[13px] font-semibold text-muted-foreground">
          {t("placeholder.playerNote")} — {t("placeholder.ctaSoon")}.
        </p>
      </div>

      <Link
        href={`/books/${bookSlug}/units/${unit}`}
        className="mt-8 inline-flex items-center gap-1 text-[13.5px] font-bold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("placeholder.backToUnit")}
      </Link>
    </div>
  );
}
