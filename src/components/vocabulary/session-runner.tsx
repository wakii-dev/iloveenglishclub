"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, Moon, Sun, Zap } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  type GradeResult,
  type SessionKind,
  type SessionStep,
} from "@/lib/vocabulary/learn-session";
import {
  createSessionState,
  sessionReducer,
  sessionSlots,
  sessionSummary,
  type LevelInfo,
  type SessionState,
} from "@/lib/vocabulary/session-state";
import { IntroduceCard } from "./session-introduce-card";
import { McStep } from "./session-mc-step";
import { ListenStep } from "./session-listen-step";
import { TypeStep } from "./session-type-step";
import { SessionSummary } from "./session-summary";

/**
 * SessionRunner (vocab-memrise SF-3, VU-40 — context pack #1/#6, hand-off
 * §2.2/§3): client state machine trên step list GET /api/vocabulary/session
 * (reducer PURE ở lib/vocabulary/session-state.ts — test node được). Chấm QUA
 * POST — payload không có đáp án nên UI không tự biết lời giải (option đúng
 * chỉ được tô khi CHÍNH lựa chọn đó được chấm đúng). Reload = GET lại (queue
 * còn lại server-derived — trang force-dynamic). Dark toggle scope container
 * (hand-off §4 — KHÔNG đụng theme toàn app), localStorage `ilec.vocab-theme`.
 */

export type RunnerHeader = {
  title: string;
  subtitle?: string;
  backHref: string;
};

/** Độ trễ tự chuyển sau feedback ĐÚNG — kịp thấy "+XP" rồi đi tiếp (design §3). */
const ADVANCE_DELAY_MS = 1000;

export function SessionRunner({
  kind,
  sessionKey,
  bookId,
  steps,
  header,
  levelInfo = null,
}: {
  kind: SessionKind;
  sessionKey: string;
  /** learn: id sách; review scope-all: null → POST gửi 1 (route bắt buộc positive — coordination note SF-2, store bỏ qua với review). */
  bookId: number | null;
  steps: SessionStep[];
  header: RunnerHeader;
  /** learn — summary stat level + CTA "Học Level kế". */
  levelInfo?: LevelInfo | null;
}) {
  const t = useTranslations("vocabulary.session");
  const [state, dispatch] = useReducer(sessionReducer, undefined, () =>
    createSessionState(steps, kind),
  );
  // Mirror cho async handler + HARD-GUARD double-submit ĐỒNG BỘ: state ref
  // chỉ cập nhật lúc render — 2 click cùng frame đều thấy submitting=false;
  // pendingRef chặn ngay trong handler (server idempotency là lớp sau cùng).
  const stateRef = useRef<SessionState>(state);
  stateRef.current = state;
  const pendingRef = useRef(false);
  const [dark, setDark] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (window.localStorage.getItem("ilec.vocab-theme") === "dark") {
      setDark(true);
    }
  }, []);

  const head = state.queue[0];
  const done = head === undefined;
  const summary = sessionSummary(state);

  // Focus card khi đổi bước (kể cả requeue — attemptNo trong key) — tab order
  // đoán được, context pack #12; feedback sai → nút "Tiếp tục" autoFocus.
  const stepKey = head
    ? `${head.stepIndex}:${state.attempts.get(head.wordId) ?? 1}`
    : "done";
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    cardRef.current?.focus();
  }, [stepKey]);

  // Đúng → tự chuyển sau 1 nhịp để kịp thấy "+XP"; sai → chờ bấm "Tiếp tục"
  // (từ quay lại cuối hàng — thấy rõ, acceptance #2).
  useEffect(() => {
    if (!state.feedback?.result.correct) return;
    const timer = setTimeout(
      () => dispatch({ type: "advance" }),
      ADVANCE_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [state.feedback]);

  // Mở hard-guard SAU khi state post-submit (feedback/postError/authExpired)
  // đã RENDER — click giữa chừng vẫn thấy pendingRef=true.
  useEffect(() => {
    if (!state.submitting) pendingRef.current = false;
  }, [state.submitting]);

  function answer(step: SessionStep, response: string) {
    if (pendingRef.current || stateRef.current.feedback) return;
    pendingRef.current = true;
    dispatch({ type: "submit" });
    const attemptNo = stateRef.current.attempts.get(step.wordId) ?? 1;
    void (async () => {
      try {
        const res = await fetch("/api/vocabulary/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionKey,
            kind,
            bookId: bookId ?? 1,
            wordId: step.wordId,
            stepIndex: step.stepIndex,
            attemptNo,
            stepKind: step.kind,
            response,
          }),
        });
        if (res.status === 401) {
          dispatch({ type: "auth-expired" });
          return;
        }
        if (!res.ok) {
          dispatch({ type: "post-failed" });
          return;
        }
        const result = (await res.json()) as GradeResult & { ok: boolean };
        dispatch({ type: "graded", step, result, response });
      } catch {
        dispatch({ type: "post-failed" });
      }
    })();
  }

  if (state.authExpired) {
    return (
      <div className="mx-auto max-w-[470px] rounded-[24px] border-[1.5px] border-border bg-card p-8 text-center shadow-[0_10px_30px_rgba(67,40,24,0.08)]">
        <p role="alert" className="text-[14.5px] font-bold text-red">
          {t("loginRequired")}
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(pathname ?? "/vocabulary")}`}
          className="mt-4 inline-flex min-h-[54px] items-center rounded-[16px] bg-primary px-6 font-display text-[16px] font-bold text-primary-foreground shadow-[0_4px_0_var(--primary-deep)] transition-transform active:translate-y-[3px] active:shadow-none"
        >
          {t("loginCta")}
        </Link>
      </div>
    );
  }

  const planted = summary.planted;
  const total = state.wordsOrder.length;
  const stateLine = head
    ? t("stateLine", {
        current: state.wordsOrder.indexOf(head.wordId) + 1,
        total,
        planted,
        step: t(`step.${head.kind}`),
      })
    : null;

  return (
    <div className={dark ? "dark" : undefined}>
      <div className="mx-auto max-w-[470px]">
        {/* Header phiên — back 44 + meta + toggle dark + chip XP gold (hand-off §2.2/§4) */}
        <div className="mb-3.5 flex items-center gap-2.5">
          <Link
            href={header.backHref}
            aria-label={t("back")}
            className="flex size-[44px] shrink-0 items-center justify-center rounded-[14px] border-[1.5px] border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ChevronLeft aria-hidden className="size-[18px]" />
          </Link>
          <div className="min-w-0 flex-1 leading-[1.25]">
            <p className="truncate font-display text-[16px] font-bold">
              {header.title}
            </p>
            {header.subtitle ? (
              <p className="truncate text-[12.5px] text-muted-foreground">
                {header.subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !dark;
              setDark(next);
              window.localStorage.setItem(
                "ilec.vocab-theme",
                next ? "dark" : "light",
              );
            }}
            aria-label={dark ? t("theme.toLight") : t("theme.toDark")}
            data-testid="vocab-theme-toggle"
            className="flex size-[40px] shrink-0 cursor-pointer items-center justify-center rounded-[12px] border-[1.5px] border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {dark ? (
              <Sun aria-hidden className="size-[18px]" />
            ) : (
              <Moon aria-hidden className="size-[18px]" />
            )}
          </button>
          <span
            data-testid="xp-chip"
            className="flex shrink-0 items-center gap-1 rounded-full border-[1.5px] border-gold-soft-line bg-gold-soft px-3 py-[7px] text-[13px] font-extrabold text-gold tabular-nums"
          >
            <Zap aria-hidden className="size-[14px]" />
            {t("xpChip", { xp: summary.xpTotal })}
          </span>
        </div>

        {/* Progress: learn = slot hạt giống (phiên 5 từ); review = bar teal
            (due có thể tới 50 — slot 44px không vừa, hand-off chỉ pin learn) */}
        {!done ? (
          <div className="mb-3">
            {kind === "learn" ? (
              <div
                role="img"
                aria-label={t("progressAria", { done: planted, total })}
                className="flex justify-center gap-2.5 py-2.5"
                data-testid="seed-progress"
              >
                {sessionSlots(state).map((slot) => (
                  <span
                    key={slot.wordId}
                    data-state={slot.state}
                    className={`relative grid size-[44px] place-items-center rounded-full ${
                      slot.state === "done"
                        ? "bg-leaf-soft text-leaf-deep"
                        : slot.state === "active"
                          ? "border-[2.5px] border-primary bg-card text-primary"
                          : "bg-muted text-dim"
                    }`}
                  >
                    {slot.state === "done" ? (
                      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                        <path
                          d="M4 12.5 9.5 18 20 6.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                        <circle cx="12" cy="14" r="3.4" fill="currentColor" />
                      </svg>
                    )}
                    {slot.state === "active" ? (
                      <span
                        aria-hidden
                        className="absolute -inset-1.5 animate-[vocab-slot-pulse_1.6s_ease-out_infinite] rounded-full border-2 border-primary/35 motion-reduce:animate-none"
                      />
                    ) : null}
                  </span>
                ))}
              </div>
            ) : (
              <div
                role="img"
                aria-label={t("progressAria", { done: planted, total })}
                className="mx-auto w-full max-w-[420px] py-2.5"
                data-testid="review-progress"
              >
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-secondary transition-[width]"
                    style={{
                      width: `${(planted / Math.max(1, total)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
            {stateLine ? (
              <p className="text-center text-[13px] text-muted-foreground tabular-nums">
                {stateLine}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Màn step — card 24 + viền line + shadow mềm; fadeup khi đổi bước */}
        {done ? (
          <SessionSummary
            summary={summary}
            kind={kind}
            levelInfo={levelInfo}
            streak={state.lastStreak}
            dashboardHref="/vocabulary"
          />
        ) : (
          <div
            ref={cardRef}
            tabIndex={-1}
            key={stepKey}
            data-testid="step-card"
            className="animate-[fade-up_0.45s_cubic-bezier(0.22,1,0.36,1)_both] rounded-[24px] border-[1.5px] border-border bg-card p-5 shadow-[0_10px_30px_rgba(67,40,24,0.08)] outline-none motion-reduce:animate-none"
          >
            {head.kind === "introduce" ? (
              <IntroduceCard
                step={head}
                testSteps={state.chains.get(head.wordId)?.length ?? 0}
                onContinue={() => dispatch({ type: "advance" })}
              />
            ) : head.kind === "mc" ? (
              <McStep
                step={head}
                feedback={state.feedback}
                submitting={state.submitting}
                onAnswer={(response) => answer(head, response)}
              />
            ) : head.kind === "listen" ? (
              <ListenStep
                step={head}
                feedback={state.feedback}
                submitting={state.submitting}
                onAnswer={(response) => answer(head, response)}
              />
            ) : (
              <TypeStep
                step={head}
                feedback={state.feedback}
                seenWord={state.seenWords.get(head.wordId)}
                submitting={state.submitting}
                onAnswer={(response) => answer(head, response)}
              />
            )}
          </div>
        )}

        {/* Sai → chờ xác nhận "Tiếp tục" (từ requeue cuối hàng — thấy rõ,
            acceptance #2); đúng → runner tự hẹn giờ chuyển. */}
        {state.feedback && !state.feedback.result.correct ? (
          <button
            type="button"
            autoFocus
            onClick={() => dispatch({ type: "advance" })}
            data-testid="continue-after-wrong"
            className="mt-2 min-h-[48px] w-full cursor-pointer rounded-[14px] font-extrabold text-muted-foreground transition-colors hover:bg-accent"
          >
            {t("feedback.continue")}
          </button>
        ) : null}

        {state.postError ? (
          <p
            role="alert"
            className="mt-3 text-center text-[13.5px] font-bold text-red"
          >
            {t("error")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
