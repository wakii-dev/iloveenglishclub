import { BookOpen, Headphones, Repeat } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ContinueCard } from "@/lib/vocabulary/dashboard-store";
import type { DictationNextCard } from "@/lib/today/today-store";

/**
 * 3 suggestion cards (daily-journey SF-3, VU-51 — hand-off §3 + spec
 * §2.1): dictation next (deep-link listen-and-type + doneParts/totalParts,
 * mọi sách xong → trạng thái hoàn thành) · vocab due (N từ →
 * /me/vocabulary?scope=all) · vocab continue (level kế →
 * /vocabulary/learn/{bookId}, hết → "hoàn thành sách"). Thứ tự ưu tiên
 * theo remaining goal: group phút (dictation) vs group từ (due, continue)
 * — group còn-thiếu-% cao hơn đứng trước; trong group từ: due trước
 * continue (ôn trước học mới — thứ tự epic §2.1).
 */
function remainingPct(done: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, 1 - done / goal);
}

export function TodaySuggestions({
  dictation,
  dueToday,
  vocabContinue,
  listenMinutes,
  goalMinutes,
  practiced,
  goalWords,
}: {
  dictation: DictationNextCard | null;
  dueToday: number;
  vocabContinue: ContinueCard | null;
  listenMinutes: number;
  goalMinutes: number;
  practiced: number;
  goalWords: number;
}) {
  const t = useTranslations("today");

  const dictationFirst =
    remainingPct(listenMinutes, goalMinutes) >=
    remainingPct(practiced, goalWords);

  const dictationCard = (
    <article
      key="dictation"
      data-testid="suggestion-dictation"
      className="rounded-[20px] border-[1.5px] border-border bg-card p-4"
    >
      <div className="flex items-center gap-2 text-primary">
        <Headphones aria-hidden className="size-[18px]" />
        <h3 className="text-[14px] font-extrabold">
          {t("suggestions.dictationTitle")}
        </h3>
      </div>
      {dictation ? (
        <>
          <p className="mt-1.5 line-clamp-2 text-[14.5px] font-bold">
            {dictation.titleVi ?? dictation.title}
          </p>
          <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground tabular-nums">
            {t("suggestions.partsProgress", {
              done: dictation.doneParts,
              total: dictation.totalParts,
            })}
          </p>
          <Link
            href={`/books/${dictation.bookSlug}/units/${dictation.unitNumber}/lessons/${dictation.lessonNumber}/listen-and-type`}
            className="mt-2.5 inline-flex min-h-[44px] items-center rounded-[14px] bg-primary px-4 text-[13.5px] font-bold text-primary-foreground shadow-[0_3px_0_var(--primary-deep)] transition-transform active:translate-y-[2px] active:shadow-none focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            {t("suggestions.dictationCta")}
          </Link>
        </>
      ) : (
        <p className="mt-1.5 text-[13.5px] font-semibold text-muted-foreground">
          {t("suggestions.dictationDone")}
        </p>
      )}
    </article>
  );

  const dueCard = (
    <article
      key="due"
      data-testid="suggestion-due"
      className="rounded-[20px] border-[1.5px] border-border bg-card p-4"
    >
      <div className="flex items-center gap-2 text-secondary">
        <Repeat aria-hidden className="size-[18px]" />
        <h3 className="text-[14px] font-extrabold">
          {dueToday > 0
            ? t("suggestions.dueTitle", { count: dueToday })
            : t("suggestions.dueEmpty")}
        </h3>
      </div>
      {dueToday > 0 ? (
        <Link
          href="/me/vocabulary?scope=all"
          className="mt-2.5 inline-flex min-h-[44px] items-center rounded-[14px] bg-secondary px-4 text-[13.5px] font-bold text-secondary-foreground transition-transform focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {t("suggestions.dueCta")}
        </Link>
      ) : null}
    </article>
  );

  const continueCard = (
    <article
      key="continue"
      data-testid="suggestion-continue"
      className="rounded-[20px] border-[1.5px] border-border bg-card p-4"
    >
      <div className="flex items-center gap-2 text-gold">
        <BookOpen aria-hidden className="size-[18px]" />
        {vocabContinue ? (
          <h3 className="line-clamp-1 text-[14px] font-extrabold">
            {t("suggestions.continueTitle", {
              title: vocabContinue.titleVi ?? vocabContinue.titleEn,
            })}
          </h3>
        ) : null}
      </div>
      {vocabContinue && !vocabContinue.completed ? (
        <>
          <p className="mt-1.5 text-[13.5px] font-semibold text-muted-foreground">
            {t("suggestions.continueLevel", {
              level: vocabContinue.level.levelIndex + 1,
              count: vocabContinue.newCount,
            })}
          </p>
          <Link
            href={`/vocabulary/learn/${vocabContinue.bookId}`}
            className="mt-2.5 inline-flex min-h-[44px] items-center rounded-[14px] border-[1.5px] border-gold-soft-line bg-gold-soft px-4 text-[13.5px] font-bold text-gold focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            {t("suggestions.continueCta")}
          </Link>
        </>
      ) : (
        <p className="mt-1.5 text-[13.5px] font-semibold text-muted-foreground">
          {t("suggestions.continueDone")}
        </p>
      )}
    </article>
  );

  const wordsGroup = [dueCard, continueCard];

  return (
    <section
      aria-labelledby="today-suggestions-heading"
      className="mt-5"
    >
      <h2
        id="today-suggestions-heading"
        className="font-display text-[19px] font-extrabold"
      >
        {t("suggestions.heading")}
      </h2>
      <div className="mt-3 grid gap-3">
        {dictationFirst ? [dictationCard, ...wordsGroup] : [...wordsGroup, dictationCard]}
      </div>
    </section>
  );
}
