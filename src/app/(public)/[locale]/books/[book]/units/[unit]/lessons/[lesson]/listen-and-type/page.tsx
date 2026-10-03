import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getBook, getLesson, getLessons, getUnit } from "@/lib/content/queries";
import { resolveAudioUrl } from "@/lib/storage";
import { DictationLesson } from "@/components/dictation/dictation-lesson";

/**
 * Lesson dictation (SF-4) — route contract SF-2 giữ nguyên; SF-7 thêm metadata
 * file riêng. ISR on-demand: KHÔNG prerender hàng nghìn lesson × 2 locale lúc
 * build (§3); KHÔNG auth() ở RSC — auth() đọc cookies ⟹ dynamic, hỏng ISR
 * (session xử lý client-side qua useSession trong orchestrator).
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

export default async function LessonDictationPage({
  params,
}: {
  params: Promise<{ locale: string; book: string; unit: string; lesson: string }>;
}) {
  const { locale, book: bookSlug, unit, lesson } = await params;
  setRequestLocale(locale);
  const [book, unitRow, lessonRow, unitLessons] = await Promise.all([
    getBook(bookSlug, locale),
    getUnit(bookSlug, unit, locale),
    getLesson(bookSlug, unit, lesson, locale),
    getLessons(bookSlug, unit, locale),
  ]);
  if (!lessonRow || !unitRow || !book) notFound();

  // "Bài tiếp theo" (§5.7): lesson published kế cùng unit theo number; hết → null
  const next = unitLessons.find((l) => l.number === lessonRow.number + 1);
  const nextHref = next
    ? `/books/${bookSlug}/units/${unit}/lessons/${next.number}/listen-and-type`
    : null;

  return (
    <DictationLesson
      bookTitle={book.title}
      unitTitle={unitRow.title}
      lessonTitle={lessonRow.title}
      cefrLabel={book.cefrLabel}
      unitNumber={unitRow.number}
      bookId={book.id}
      parts={lessonRow.parts.map((p) => ({
        id: p.id,
        text: p.text,
        audioUrl: p.audioPath ? resolveAudioUrl(p.audioPath) : null,
        durationMs: p.durationMs,
      }))}
      nextHref={nextHref}
      unitHref={`/books/${bookSlug}/units/${unit}`}
    />
  );
}
