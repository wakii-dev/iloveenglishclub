/**
 * State machine client của SessionRunner (vocab-memrise SF-3, VU-40 —
 * context pack #1/#6). PURE, không db/next/react (cùng tách lớp learn-session
 * ⋈ session-runner.tsx — node-test được, pattern quiz.ts ⋈ quiz-runner).
 *
 * Contract CỨNG (pin session-state.test.ts):
 * - Requeue từ-sai là TRẠNG THÁI CLIENT: đuôi chain của từ (từ bước sai
 *   onward) xuống CUỐI hàng, attemptNo +1; introduce KHÔNG lặp.
 * - `completed` CHỈ khi grade != null (bước type — contract SF-2 trả grade
 *   khi từ hoàn thành lượt); stage suy từ grade qua growthStage (SF-1 lib).
 * - Payload không đáp án → state chỉ TỒ trữ word khi payload lộ hợp lệ
 *   (introduce/mc — seenWords) cho type-feedback echo/near-detect.
 */

import { growthStage } from "./growth";
import type {
  GradeResult,
  SessionKind,
  SessionStep,
} from "./learn-session";

export type WordResult = {
  correctSteps: number;
  completed: boolean;
  stage: number | null;
};

/** Feedback đang mở — kèm response người dùng chọn (tô option/input). */
export type StepFeedback = {
  step: SessionStep;
  result: GradeResult;
  response: string;
};

export type SessionState = {
  kind: SessionKind;
  queue: SessionStep[];
  /** Chuỗi test bước GỐC per từ — requeue lấy slice từ bước sai onward. */
  chains: Map<number, SessionStep[]>;
  /** wordId → word khi payload lộ hợp lệ (introduce/mc) — type feedback echo. */
  seenWords: Map<number, string>;
  /** wordId → attemptNo hiện tại (bắt đầu 1 — POST idempotency theo SF-2). */
  attempts: Map<number, number>;
  /** Thứ tự word xuất hiện lần đầu — slot progress + stateLine. */
  wordsOrder: number[];
  results: Map<number, WordResult>;
  submitting: boolean;
  feedback: StepFeedback | null;
  xpTotal: number;
  xpCapped: boolean;
  correctSteps: number;
  lastStreak: number;
  postError: boolean;
  authExpired: boolean;
};

export type SessionAction =
  | { type: "submit" }
  | {
      type: "graded";
      step: SessionStep;
      result: GradeResult;
      response?: string;
    }
  | { type: "advance" }
  | { type: "post-failed" }
  | { type: "auth-expired" };

/** Trạng thái ban đầu từ step list GET — chains/seenWords/wordsOrder derive 1 lần. */
export function createSessionState(
  steps: SessionStep[],
  kind: SessionKind,
): SessionState {
  const chains = new Map<number, SessionStep[]>();
  const seenWords = new Map<number, string>();
  const wordsOrder: number[] = [];
  for (const step of steps) {
    if (!wordsOrder.includes(step.wordId)) wordsOrder.push(step.wordId);
    if (step.kind !== "introduce") {
      const chain = chains.get(step.wordId);
      if (chain) chain.push(step);
      else chains.set(step.wordId, [step]);
    }
    if (step.word) seenWords.set(step.wordId, step.word);
  }
  return {
    kind,
    queue: [...steps],
    chains,
    seenWords,
    attempts: new Map(wordsOrder.map((wordId) => [wordId, 1])),
    wordsOrder,
    results: new Map(
      wordsOrder.map((wordId) => [
        wordId,
        { correctSteps: 0, completed: false, stage: null },
      ]),
    ),
    submitting: false,
    feedback: null,
    xpTotal: 0,
    xpCapped: false,
    correctSteps: 0,
    lastStreak: 0,
    postError: false,
    authExpired: false,
  };
}

function graded(
  state: SessionState,
  action: Extract<SessionAction, { type: "graded" }>,
): SessionState {
  const { step, result } = action;
  const prev =
    state.results.get(step.wordId) ??
    { correctSteps: 0, completed: false, stage: null };
  const results = new Map(state.results);
  if (result.correct) {
    results.set(step.wordId, {
      correctSteps: prev.correctSteps + 1,
      // grade chỉ trả khi bước type (từ hoàn thành lượt — contract SF-2)
      completed: prev.completed || result.grade != null,
      stage:
        result.grade != null
          ? growthStage({
              reps: result.grade.reps,
              intervalDays: result.grade.intervalDays,
            })
          : prev.stage,
    });
  }
  return {
    ...state,
    submitting: false,
    postError: false,
    feedback: {
      step,
      result,
      response: action.response ?? "",
    },
    results,
    xpTotal: state.xpTotal + result.xpAwarded,
    xpCapped: state.xpCapped || result.xpCapped,
    correctSteps: state.correctSteps + (result.correct ? 1 : 0),
    lastStreak: result.streak,
  };
}

/**
 * Advance: đúng → bước kế. Sai → hủy các bước còn treo của từ, đuôi chain
 * (từ bước sai onward) xuống CUỐI hàng + attemptNo +1 ("từ sai quay lại cuối
 * hàng phiên" — acceptance #2); introduce/không-feedback → shift thuần.
 */
function advance(state: SessionState): SessionState {
  const feedback = state.feedback;
  if (!feedback) return { ...state, queue: state.queue.slice(1) };
  const { step, result } = feedback;
  let queue = state.queue.slice(1);
  let attempts = state.attempts;
  if (!result.correct) {
    queue = queue.filter((s) => s.wordId !== step.wordId);
    const chain = state.chains.get(step.wordId) ?? [];
    const failedAt = chain.findIndex((s) => s.kind === step.kind);
    const requeueTail = chain.slice(failedAt === -1 ? chain.length : failedAt);
    queue = [...queue, ...requeueTail.map((s) => ({ ...s }))];
    attempts = new Map(state.attempts);
    attempts.set(step.wordId, (state.attempts.get(step.wordId) ?? 1) + 1);
  }
  return { ...state, queue, attempts, feedback: null };
}

/** Reducer thuần — UI chỉ dispatch; side-effect (fetch) ở handler component. */
export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case "submit":
      return { ...state, submitting: true, postError: false };
    case "graded":
      return graded(state, action);
    case "advance":
      return advance(state);
    case "post-failed":
      return { ...state, submitting: false, postError: true };
    case "auth-expired":
      return { ...state, submitting: false, authExpired: true };
  }
}

export type SlotView = { wordId: number; state: "pending" | "active" | "done" };

/** Slot hạt giống: done đè active (design §3 — done ngay khi từ hoàn thành lượt). */
export function sessionSlots(state: SessionState): SlotView[] {
  const headWord = state.queue[0]?.wordId;
  return state.wordsOrder.map((wordId) => ({
    wordId,
    state: state.results.get(wordId)?.completed
      ? "done"
      : wordId === headWord
        ? "active"
        : "pending",
  }));
}

export type SessionSummaryData = {
  xpTotal: number;
  xpCapped: boolean;
  planted: number;
  correctSteps: number;
  maxStage: number;
};

export function sessionSummary(state: SessionState): SessionSummaryData {
  let planted = 0;
  let maxStage = 0;
  for (const result of state.results.values()) {
    if (result.completed) planted += 1;
    if (result.stage != null) maxStage = Math.max(maxStage, result.stage);
  }
  return {
    xpTotal: state.xpTotal,
    xpCapped: state.xpCapped,
    planted,
    correctSteps: state.correctSteps,
    maxStage,
  };
}

export type LevelInfo = {
  /** 1-based để hiển thị. */
  level: number;
  from: number;
  to: number;
  plantedInChunk: number;
  chunkTotal: number;
};
