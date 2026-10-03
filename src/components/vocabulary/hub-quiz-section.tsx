import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { QuizRunner } from "@/components/vocabulary/quiz-runner";
import { HubQuizPicker } from "@/components/vocabulary/hub-quiz-picker";
import { localize } from "@/lib/content/localize";
import { parseQuizTabFilters } from "@/lib/vocabulary/hub-status";
import { listHubBooks } from "@/lib/vocabulary/hub-store";
import { buildHubQuiz } from "@/lib/vocabulary/quiz-store";

/**
 * Tab Kiểm tra (SF-3 t-3.2) — không ?scope= → picker chọn phạm vi (tất cả /
 * 1 sách / nhiều sách); có scope → sinh đề server-side (buildHubQuiz) và chạy
 * QuizRunner tái dùng (flow per-book SF-4, POST mang scope). Scope "book"
 * trong hub vẫn ghi quiz_attempts.book_id (cột chỉ NULL với all/multi).
 * Guest không bao giờ render section này (page điều phối redirect login).
 * force-dynamic ở page → "Làm lại" nhận đề xáo mới.
 */
export async function HubQuizSection({
  sp,
  locale,
}: {
  sp: { scope?: string; book?: string; books?: string };
  locale: string;
}) {
  const t = await getTranslations("vocabulary");
  const filter = parseQuizTabFilters(sp);

  if (filter.kind === "picker") {
    const books = await listHubBooks();
    return (
      <HubQuizPicker
        books={books.map((book) => ({
          id: book.id,
          title: localize(locale, { en: book.titleEn, vi: book.titleVi }),
        }))}
      />
    );
  }

  const scope = filter.scope;
  const questions = await buildHubQuiz(scope);
  const params = new URLSearchParams({ tab: "quiz", scope: scope.kind });
  if (scope.kind === "book") params.set("book", String(scope.bookId));
  if (scope.kind === "multi") params.set("books", scope.bookIds.join(","));
  const loginNext = `/${locale}/vocabulary?${params.toString()}`;

  return (
    <section
      aria-labelledby="quiz-hub-heading"
      className="mt-6 rounded-[18px] border-2 border-border bg-card p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="quiz-hub-heading" className="font-display text-[20px] font-bold">
          {t("quizTitle")}
        </h2>
        <Link
          href="/vocabulary?tab=quiz"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("hub.quiz.changeScope")}
        </Link>
      </div>

      <div className="mt-4">
        {questions.length === 0 ? (
          <p className="rounded-[14px] border-2 border-dashed border-border p-5 text-center text-[14px] font-semibold text-muted-foreground">
            {t("hub.quiz.empty")}
          </p>
        ) : (
          <>
            <p className="text-[15px] font-semibold text-muted-foreground tabular-nums">
              {t("hub.quiz.lead", { count: questions.length })}
            </p>
            <div className="mt-4 max-w-[720px]">
              <QuizRunner
                scope={scope.kind === "book" ? undefined : scope}
                bookId={scope.kind === "book" ? scope.bookId : undefined}
                loginNext={loginNext}
                questions={questions}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
