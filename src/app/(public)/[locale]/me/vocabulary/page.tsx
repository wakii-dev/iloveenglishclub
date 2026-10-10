import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { getReviewSession } from "@/lib/vocabulary/learn-session-store";
import { SessionRunner } from "@/components/vocabulary/session-runner";

/**
 * /me/vocabulary — phiên ÔN TẬP mới (vocab-memrise SF-3, VU-40 — context
 * pack #9): rewrite render review runner (GET ?kind=review qua store) thay
 * flashcard lật legacy. URL contract GIỮ NGUYÊN: `?scope=book&book=<id>` thu
 * hẹp hàng due; `?word=<id>` prefill 1 từ (tab Thư viện "Học từ này" +
 * hub-review-section CTA `?scope=all` mặc định). Prefill không có progress →
 * FALLBACK phiên thường (URL là ý user — không 404 cứng). steps rỗng →
 * nothing-due. dueAt/SM-2/XP do POST /api/vocabulary/session (engine SF-2).
 */
export const dynamic = "force-dynamic"; // auth() đọc cookies + queue re-derive

export default async function MeVocabularyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ word?: string; scope?: string; book?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    // Pattern me/page: redirect locale-prefix tường minh + ?next quay lại
    redirect(`/${locale}/login?next=/${locale}/me/vocabulary`);
  }
  const t = await getTranslations("vocabulary");
  const sp = await searchParams;
  const prefillId =
    typeof sp.word === "string" && /^\d+$/.test(sp.word)
      ? Number.parseInt(sp.word, 10)
      : undefined;
  const scopeBook =
    typeof sp.book === "string" && /^\d+$/.test(sp.book)
      ? Number.parseInt(sp.book, 10)
      : undefined;

  const outcome = await getReviewSession(userId, {
    bookId: scopeBook,
    wordId: prefillId,
  });
  if (!outcome.ok && outcome.error === "invalidBook") notFound();
  // Prefill hụt (không progress / word ngoài scope) → fallback phiên thường
  const finalOutcome =
    outcome.ok || outcome.error !== "wordNotFound"
      ? outcome
      : await getReviewSession(userId, { bookId: scopeBook });
  if (!finalOutcome.ok) notFound();

  if (finalOutcome.steps.length === 0) {
    return (
      <div className="mx-auto max-w-[1120px] px-6 py-12">
        <h1 className="font-display text-[33px] leading-tight font-bold tracking-tight">
          {t("reviewTitle")}
        </h1>
        <p className="mt-6 rounded-[18px] border-2 border-dashed border-border bg-card p-6 text-center text-[14px] text-muted-foreground">
          {t("reviewEmpty")}
        </p>
      </div>
    );
  }

  const wordCount = new Set(finalOutcome.steps.map((step) => step.wordId)).size;

  return (
    <div className="px-4 py-6">
      <SessionRunner
        kind="review"
        sessionKey={finalOutcome.sessionKey}
        bookId={finalOutcome.bookId}
        steps={finalOutcome.steps}
        header={{
          title: t("reviewTitle"),
          subtitle: t("dueToday", { count: wordCount }),
          backHref: "/vocabulary",
        }}
      />
    </div>
  );
}
