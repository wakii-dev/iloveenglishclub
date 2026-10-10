import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import { db } from "@/db";
import { bookWords, books, userWordProgress } from "@/db/schema";
import { WORDS_PER_LEVEL } from "@/lib/vocabulary/levels";
import { getLearnSession } from "@/lib/vocabulary/learn-session-store";
import type { LevelInfo } from "@/lib/vocabulary/session-state";
import { SessionRunner } from "@/components/vocabulary/session-runner";

/**
 * Learn session /vocabulary/learn/[book] (vocab-memrise SF-3, VU-40 —
 * context pack #8): force-dynamic, auth redirect `?next` (pattern
 * me/vocabulary), [book] = bookId số (không hợp lệ / sách không tồn tại →
 * notFound). GET session QUA STORE (server-side — nguồn queue này với route
 * GET; route là bề mặt API public đã pin test). steps rỗng → sách hoàn thành.
 * Header meta level/range derive TỪ CHÍNH queue bước (orders của wordIds →
 * chunkStart → window 10 JOIN reps) — không trùng logic store, không drift.
 */
export const dynamic = "force-dynamic"; // auth() đọc cookies + queue re-derive

export default async function LearnSessionPage({
  params,
}: {
  params: Promise<{ locale: string; book: string }>;
}) {
  const { locale, book } = await params;
  setRequestLocale(locale);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect(
      `/${locale}/login?next=/${locale}/vocabulary/learn/${book}`,
    );
  }
  if (!/^\d+$/.test(book)) notFound();
  const bookId = Number.parseInt(book, 10);

  const outcome = await getLearnSession(userId, bookId);
  if (!outcome.ok) notFound(); // invalidBook — sách không tồn tại

  const t = await getTranslations("vocabulary.session");
  const [bookRow] = await db
    .select({
      titleEn: books.titleEn,
      titleVi: books.titleVi,
      cefrLabel: books.cefrLabel,
    })
    .from(books)
    .where(eq(books.id, bookId))
    .limit(1);
  if (!bookRow) notFound(); // race xoá sách giữa 2 query — hiếm
  const title = locale === "vi" ? (bookRow.titleVi ?? bookRow.titleEn) : bookRow.titleEn;

  if (outcome.steps.length === 0) {
    return (
      <div className="mx-auto max-w-[470px] px-4 py-10">
        <div className="rounded-[24px] border-[1.5px] border-border bg-card p-8 text-center shadow-[0_10px_30px_rgba(67,40,24,0.08)]">
          <p className="font-display text-[27px] leading-tight font-bold">
            {t("learnDone.title")}
          </p>
          <p className="mt-2 text-[14.5px] font-semibold text-muted-foreground">
            {t("learnDone.body")}
          </p>
          <Link
            href="/vocabulary"
            className="mt-6 inline-flex min-h-[54px] items-center rounded-[16px] bg-primary px-6 font-display text-[16px] font-bold text-primary-foreground shadow-[0_4px_0_var(--primary-deep)] transition-transform active:translate-y-[3px] active:shadow-none"
          >
            {t("learnDone.cta")}
          </Link>
        </div>
      </div>
    );
  }

  // Header meta từ CHÍNH queue: orders của wordIds phiên → vị trí chunk →
  // window 10 (JOIN reps) → level/range/planted (bounded ≤5 + count + 10 rows)
  const stepWordIds = [
    ...new Set(outcome.steps.map((step) => step.wordId)),
  ];
  const orderRows = await db
    .select({ wordId: bookWords.wordId, order: bookWords.order })
    .from(bookWords)
    .where(
      and(eq(bookWords.bookId, bookId), inArray(bookWords.wordId, stepWordIds)),
    );
  const minOrder = Math.min(...orderRows.map((row) => row.order));
  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookWords)
    .where(and(eq(bookWords.bookId, bookId), lt(bookWords.order, minOrder)));
  const chunkStart =
    Math.floor((countRow?.n ?? 0) / WORDS_PER_LEVEL) * WORDS_PER_LEVEL;
  const windowRows = await db
    .select({ reps: sql<number>`coalesce(${userWordProgress.reps}, 0)::int` })
    .from(bookWords)
    .leftJoin(
      userWordProgress,
      and(
        eq(userWordProgress.wordId, bookWords.wordId),
        eq(userWordProgress.userId, userId),
      ),
    )
    .where(eq(bookWords.bookId, bookId))
    .orderBy(asc(bookWords.order))
    .offset(chunkStart)
    .limit(WORDS_PER_LEVEL);

  const levelInfo: LevelInfo = {
    level: chunkStart / WORDS_PER_LEVEL + 1,
    from: chunkStart + 1,
    to: chunkStart + windowRows.length,
    plantedInChunk: windowRows.filter((row) => row.reps > 0).length,
    chunkTotal: windowRows.length,
  };

  return (
    <div className="px-4 py-6">
      <SessionRunner
        kind="learn"
        sessionKey={outcome.sessionKey}
        bookId={bookId}
        steps={outcome.steps}
        levelInfo={levelInfo}
        header={{
          title: `${title} · ${bookRow.cefrLabel}`,
          subtitle: t("bookLevel", {
            level: levelInfo.level,
            from: levelInfo.from,
            to: levelInfo.to,
          }),
          backHref: "/vocabulary",
        }}
      />
    </div>
  );
}
