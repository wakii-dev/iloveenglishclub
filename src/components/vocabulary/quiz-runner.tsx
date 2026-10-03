"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { QuizQuestion, QuizScope, QuizType } from "@/lib/vocabulary/quiz";

/**
 * Quiz runner (SF-4 t-4.2; scope hub SF-3 t-3.2) — client thuần, state local
 * (không store mới, cùng pattern ReviewFlashcards). Trắc nghiệm chọn ngay
 * advances; điền từ submit form; ghép nghĩa chọn đủ 5 cặp mới tiếp. Hết câu
 * tự POST nộp bài; 401 → mời đăng nhập lại, lỗi khác → nút gửi lại. "Làm
 * lại" reload trang (force-dynamic) để nhận đề xáo mới từ server.
 * Phạm vi: {bookId, bookSlug} (flow per-book cũ) hoặc scope all/multi (tab
 * Quiz hub — POST mang scope thay book_id, loginNext là URL hub có query).
 */

type QuizAnswer = { wordId: number; type: QuizType; response: string };

type SubmitResult = { score: number; correct: number; total: number };

export function QuizRunner({
  bookId,
  bookSlug,
  scope,
  loginNext,
  questions,
}: {
  bookId?: number;
  bookSlug?: string;
  /** Tab Quiz hub: all/multi — POST body mang scope thay vì book_id. */
  scope?: Exclude<QuizScope, { kind: "book" }>;
  /** next= cho link đăng nhập lại khi dùng scope (URL hub có query → encode). */
  loginNext?: string;
  questions: QuizQuestion[];
}) {
  const t = useTranslations("vocabulary");
  const locale = useLocale();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [fillText, setFillText] = useState("");
  const [matchPicks, setMatchPicks] = useState<Record<number, string>>({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitFailed, setSubmitFailed] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);

  const current = questions[index];
  const loginHref = loginNext
    ? `/login?next=${encodeURIComponent(loginNext)}`
    : `/login?next=/${locale}/books/${bookSlug}/quiz`;

  async function submit(queue: QuizAnswer[]) {
    setPending(true);
    setSubmitFailed(false);
    try {
      const res = await fetch("/api/vocabulary/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(scope
            ? scope.kind === "all"
              ? { scope: "all" }
              : { scope: "multi", book_ids: scope.bookIds }
            : { book_id: bookId }),
          mode: "mixed",
          answers: queue.map((a) => ({
            word_id: a.wordId,
            type: a.type,
            response: a.response,
          })),
        }),
      });
      if (res.status === 401) {
        setAuthExpired(true);
        return;
      }
      if (!res.ok) throw new Error(`quiz POST ${res.status}`);
      const json = (await res.json()) as SubmitResult & { ok: boolean };
      setResult({ score: json.score, correct: json.correct, total: json.total });
    } catch {
      setSubmitFailed(true);
    } finally {
      setPending(false);
    }
  }

  function advance(next: QuizAnswer[]) {
    const all = [...answers, ...next];
    setAnswers(all);
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setFillText("");
      setMatchPicks({});
    } else {
      void submit(all);
    }
  }

  if (result) {
    const percent = Math.round(result.score * 100);
    return (
      <div className="mt-6 rounded-[18px] border-2 border-border bg-card p-8 text-center">
        <h2 className="font-display text-[24px] leading-tight font-bold tracking-tight">
          {t("summaryTitle")}
        </h2>
        <p className="mt-4 font-display text-[46px] leading-none font-bold text-primary tabular-nums">
          {percent}%
        </p>
        <p className="mt-3 text-[15.5px] font-semibold text-muted-foreground tabular-nums">
          {t("summaryScore", { correct: result.correct, total: result.total })} ·{" "}
          {t("summaryPercent", { percent })}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 cursor-pointer rounded-[14px] bg-primary px-5 py-2.5 text-[14px] font-bold text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {t("quizAgain")}
        </button>
      </div>
    );
  }

  if (authExpired) {
    return (
      <div className="mt-6 rounded-[18px] border-2 border-dashed border-border bg-card p-8 text-center">
        <p role="alert" className="text-[14.5px] font-semibold text-destructive">
          {t("quizLoginRequired")}
        </p>
        <Link
          href={loginHref}
          className="mt-4 inline-flex rounded-[14px] bg-primary px-5 py-2.5 text-[14px] font-bold text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {t("quizLoginCta")}
        </Link>
      </div>
    );
  }

  if (current === undefined) return null;

  return (
    <div>
      <p className="text-[13.5px] font-bold text-muted-foreground tabular-nums">
        {t("quizProgress", { current: index + 1, total: questions.length })}
      </p>

      {current.type === "multiple-choice" ? (
        <div className="mt-3 rounded-[18px] border-2 border-border bg-card p-6">
          <p className="text-[13.5px] font-semibold text-muted-foreground">
            {t("mcPrompt")}
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-display text-[30px] leading-tight font-bold tracking-tight">
            {current.word}
            {current.ipa ? (
              <span className="text-[15px] font-semibold text-muted-foreground">
                /{current.ipa}/
              </span>
            ) : null}
          </p>
          <div
            className="mt-4 grid gap-2 sm:grid-cols-2"
            role="group"
            aria-label={t("mcGroup")}
          >
            {current.options.map((option) => (
              <button
                key={option}
                type="button"
                disabled={pending}
                onClick={() =>
                  advance([
                    {
                      wordId: current.wordId,
                      type: "multiple-choice",
                      response: option,
                    },
                  ])
                }
                className="cursor-pointer rounded-[14px] border-2 border-border bg-card px-4 py-3 text-left text-[14.5px] font-bold transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : current.type === "fill-word" ? (
        <form
          className="mt-3 rounded-[18px] border-2 border-border bg-card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!fillText.trim() || pending) return;
            advance([
              { wordId: current.wordId, type: "fill-word", response: fillText },
            ]);
          }}
        >
          <p className="text-[13.5px] font-semibold text-muted-foreground">
            {t("fillPrompt")}
          </p>
          <p className="mt-1 text-[22px] leading-tight font-bold">
            {current.meaningVi}
          </p>
          <p
            aria-hidden
            className="mt-2 font-display text-[18px] font-bold tracking-[0.35em] text-muted-foreground tabular-nums"
          >
            {"_".repeat(current.letterCount)}
          </p>
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              autoFocus
              autoComplete="off"
              aria-label={t("fillAria", { meaning: current.meaningVi })}
              placeholder={t("fillPlaceholder")}
              value={fillText}
              onChange={(e) => setFillText(e.target.value)}
              className="w-full rounded-[14px] border-2 border-border bg-background px-4 py-2.5 text-[14.5px] font-bold transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
            />
            <button
              type="submit"
              disabled={!fillText.trim() || pending}
              className="cursor-pointer rounded-[14px] bg-primary px-5 py-2.5 text-[14px] font-bold whitespace-nowrap text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("nextQuestion")}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3 rounded-[18px] border-2 border-border bg-card p-6">
          <p className="text-[13.5px] font-semibold text-muted-foreground">
            {t("matchPrompt")}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {current.words.map((word) => (
              <div
                key={word.wordId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] border-2 border-border px-4 py-2.5"
              >
                <span className="font-display text-[16.5px] font-bold">
                  {word.word}
                </span>
                <select
                  aria-label={t("matchSelectAria", { word: word.word })}
                  value={matchPicks[word.wordId] ?? ""}
                  onChange={(e) =>
                    setMatchPicks((picks) => ({
                      ...picks,
                      [word.wordId]: e.target.value,
                    }))
                  }
                  className="min-w-0 flex-1 cursor-pointer rounded-[10px] border-2 border-border bg-background px-3 py-2 text-[13.5px] font-bold transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 sm:max-w-[55%]"
                >
                  <option value="" disabled>
                    …
                  </option>
                  {current.meanings.map((meaning) => (
                    <option key={meaning} value={meaning}>
                      {meaning}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={Object.keys(matchPicks).length < current.words.length || pending}
            onClick={() =>
              advance(
                current.words.map((word) => ({
                  wordId: word.wordId,
                  type: "matching" as const,
                  response: matchPicks[word.wordId] ?? "",
                })),
              )
            }
            className="mt-4 w-full cursor-pointer rounded-[14px] bg-primary px-5 py-2.5 text-[14px] font-bold text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("nextQuestion")}
          </button>
        </div>
      )}

      {pending ? (
        <p className="mt-3 text-[13.5px] font-semibold text-muted-foreground">
          {t("quizSubmitting")}
        </p>
      ) : null}
      {submitFailed ? (
        <div className="mt-3 flex items-center gap-3">
          <p role="alert" className="text-[13.5px] font-semibold text-destructive">
            {t("quizError")}
          </p>
          <button
            type="button"
            onClick={() => {
              const all = answers;
              setAnswers([]);
              void submit(all);
            }}
            className="cursor-pointer rounded-[14px] border-2 border-border bg-card px-4 py-2 text-[13.5px] font-bold transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            {t("quizRetrySubmit")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
