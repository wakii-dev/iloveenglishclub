import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { LocalizedLessonSummary } from "@/lib/content/queries";

/**
 * §2.5 LessonRow — tag loại bài pill màu (Dictation = --primary, uppercase
 * 11px) + tên + side số câu + hành động. Anon: không score chip/current state
 * (SF-4/SF-6 bổ sung khi có progress thật).
 */
export async function LessonRow({
  lesson,
  bookSlug,
  unitNumber,
}: {
  lesson: LocalizedLessonSummary;
  bookSlug: string;
  unitNumber: number;
}) {
  const t = await getTranslations("books");
  const href = `/books/${bookSlug}/units/${unitNumber}/lessons/${lesson.number}/listen-and-type`;

  return (
    <div className="flex items-center gap-3 rounded-[18px] border-2 border-border bg-card p-4 transition-colors duration-150 hover:border-secondary sm:gap-4">
      <span className="min-w-0 flex-1">
        <span className="inline-block rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-primary-foreground">
          {lesson.kind}
        </span>
        <span className="mt-1.5 block truncate font-display text-[16.5px] font-bold">
          {lesson.title}
        </span>
        <span className="mt-0.5 block text-[12.5px] font-semibold text-muted-foreground tabular-nums">
          {t("unit.lessonSentences", { count: lesson.partsCount })} ·{" "}
          {lesson.vocabLevel}
        </span>
      </span>
      <Link
        href={href}
        className="shrink-0 rounded-[14px] border-2 border-border bg-background px-3.5 py-2 text-[13px] font-extrabold text-primary transition-colors duration-150 hover:border-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        {t("lesson.open")}
      </Link>
    </div>
  );
}
