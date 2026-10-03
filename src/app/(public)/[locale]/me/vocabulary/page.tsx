import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/auth";
import { listDueWords } from "@/lib/vocabulary/review-store";
import { ReviewFlashcards } from "@/components/vocabulary/review-flashcards";

/**
 * /me/vocabulary — ôn flashcard SRS (SF-3 t-3.2). Auth bắt buộc (pattern
 * me/page.tsx: redirect login kèm ?next). Hàng "Hôm nay cần ôn: N từ" đếm
 * progress due_at ≤ now (listDueWords); thẻ lật + chấm quality ở client
 * (ReviewFlashcards), POST /api/vocabulary/review ghi SRS.
 */
export const dynamic = "force-dynamic"; // auth() đọc cookies

export default async function MeVocabularyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
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
  const due = await listDueWords(userId);

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
          <ReviewFlashcards words={due} />
        )}
      </div>
    </div>
  );
}
