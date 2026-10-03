import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { getStudyWord } from "@/lib/vocabulary/hub-store";
import { listDueWords } from "@/lib/vocabulary/review-store";
import { ReviewFlashcards } from "@/components/vocabulary/review-flashcards";

/**
 * /me/vocabulary — ôn flashcard SRS (SF-3 t-3.2). Auth bắt buộc (pattern
 * me/page.tsx: redirect login kèm ?next). Hàng "Hôm nay cần ôn: N từ" đếm
 * progress due_at ≤ now (listDueWords); thẻ lật + chấm quality ở client
 * (ReviewFlashcards), POST /api/vocabulary/review ghi SRS.
 * SF-2: ?word=<id> (tab Thư viện "Học từ này") — prefill thẻ đầu hàng, chấm
 * quality lên applyReview upsert = bắt đầu học từ bất kỳ.
 * SF-3 t-3.1: scope=all (mặc định — mọi nguồn, hub tab Ôn tập link tới) /
 * scope=book&book=<id> thu hẹp hàng ôn qua listDueWords filter.
 */
export const dynamic = "force-dynamic"; // auth() đọc cookies

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
      : null;
  const bookId =
    typeof sp.book === "string" && /^\d+$/.test(sp.book)
      ? Number.parseInt(sp.book, 10)
      : null;
  const [due, prefill] = await Promise.all([
    listDueWords(userId, bookId !== null ? { bookId } : null),
    prefillId !== null ? getStudyWord(prefillId) : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-12">
      <h1 className="font-display text-[33px] leading-tight font-bold tracking-tight">
        {t("reviewTitle")}
      </h1>
      <p className="mt-2 text-[15px] font-semibold text-muted-foreground tabular-nums">
        {t("dueToday", { count: due.length })}
      </p>

      <div className="mt-6">
        {due.length === 0 ? (
          <p className="rounded-[18px] border-2 border-dashed border-border bg-card p-6 text-center text-[14px] text-muted-foreground">
            {t("reviewEmpty")}
          </p>
        ) : (
          <ReviewFlashcards words={due} prefill={prefill} />
        )}
      </div>
    </div>
  );
}
