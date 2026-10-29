import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBook, getLesson, getLessons, getUnit } from "@/lib/content/queries";
import { resolveAudioUrl } from "@/lib/storage";
import { DictationLesson } from "@/components/dictation/dictation-lesson";

/**
 * Lesson dictation (port từ ilec listen-and-type/page.tsx — SF2 migrate).
 * URL: /dictation/[book]/[unit]/[lesson] (tree books→dictation theo spec v2).
 * Khác ilec: BỎ revalidate + generateStaticParams (Next 16 cacheComponents);
 * KHÔNG auth() ở RSC (session xử lý client-side qua useSession trong
 * orchestrator — như ilec). Bỏ sibling layout JSON-LD (lib/seo/jsonld không
 * nằm trong SF1 port — SEO sâu là SF sau).
 */
/**
 * Next 16 cacheComponents: route động không có generateStaticParams ⟹ build
 * thử prerender instant-shell và vấp uncached data (blocking-prerender-dynamic
 * error). `instant = false` = render on-demand như ISR on-demand của ilec
 * (route segment config `revalidate` đã bị cacheComponents cấm).
 */
export const instant = false;

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
    ? `/dictation/${bookSlug}/${unit}/${next.number}`
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
      unitHref={`/dictation/${bookSlug}/${unit}`}
    />
  );
}
