import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { auth } from "@/auth";
import { getBook } from "@/lib/content/queries";
import { buildBookQuiz } from "@/lib/vocabulary/quiz-store";
import { QuizRunner } from "@/components/vocabulary/quiz-runner";

/**
 * /books/[book]/quiz — làm bài kiểm tra từ vựng của book (SF-4 t-4.2). Cần
 * đăng nhập (pattern me/vocabulary: redirect login kèm ?next) vì nộp bài phải
 * lưu quiz_attempts theo user. Đề sinh server-side từ word pool — force-dynamic
 * để mỗi lần "Làm lại" (reload) nhận đề xáo mới, không ISR cache.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; book: string }>;
}): Promise<Metadata> {
  const { locale, book } = await params;
  const [t, row] = await Promise.all([
    getTranslations({ locale, namespace: "vocabulary" }),
    getBook(book, locale),
  ]);
  return { title: row ? `${t("quizTitle")} · ${row.title}` : t("quizTitle") };
}

export default async function BookQuizPage({
  params,
}: {
  params: Promise<{ locale: string; book: string }>;
}) {
  const { locale, book: bookSlug } = await params;
  setRequestLocale(locale);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    // Pattern me/vocabulary: redirect locale-prefix tường minh + ?next quay lại
    redirect(`/${locale}/login?next=/${locale}/books/${bookSlug}/quiz`);
  }
  const t = await getTranslations("vocabulary");
  const book = await getBook(bookSlug, locale);
  if (!book) notFound();
  const questions = await buildBookQuiz(book.id);

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-12">
      <Link
        href={`/books/${bookSlug}`}
        className="inline-flex items-center gap-1 text-[13.5px] font-bold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("backToBook")}
      </Link>

      <div className="mt-5">
        <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">
          {t("quizTitle")}
        </h1>
        {questions.length > 0 ? (
          <p className="mt-2 text-[15px] font-semibold text-muted-foreground tabular-nums">
            {t("quizLead", { book: book.title, count: questions.length })}
          </p>
        ) : null}
      </div>

      {questions.length === 0 ? (
        <p className="mt-8 rounded-[18px] border-2 border-dashed border-border bg-card p-6 text-center text-[14px] text-muted-foreground">
          {t("quizEmpty")}
        </p>
      ) : (
        <div className="mt-6 max-w-[720px]">
          <QuizRunner
            bookId={book.id}
            bookSlug={bookSlug}
            questions={questions}
          />
        </div>
      )}
    </div>
  );
}
