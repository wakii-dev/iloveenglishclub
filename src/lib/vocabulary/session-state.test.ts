import { describe, expect, it } from "vitest";
import {
  buildLearnSteps,
  type GradeResult,
  type SessionStep,
} from "@/lib/vocabulary/learn-session";
import {
  createSessionState,
  sessionReducer,
  sessionSlots,
  sessionSummary,
  type SessionState,
} from "./session-state";

/**
 * State machine client của SessionRunner (SF-3 t-runner) — PURE reducer test
 * không DOM. Contract SF-2: payload không đáp án; grade CHỈ ở POST response;
 * requeue từ-sai là TRẠNG THÁI CLIENT (cuối hàng, attemptNo+1 — context pack
 * SF-3 #1/#6); slot done khi từ hoàn thành lượt (type đúng — grade != null).
 */

const WORDS = [
  {
    wordId: 1,
    word: "commute",
    ipa: "kəˈmjuːt",
    meaningVi: "đi làm hằng ngày",
    example: "I commute by bike.",
    audioUrl: "audio/commute.mp3",
  },
  {
    wordId: 2,
    word: "luggage",
    ipa: "ˈlʌɡɪdʒ",
    meaningVi: "hành lý",
    example: null,
    audioUrl: "audio/luggage.mp3",
  },
] as const;

const STEPS: SessionStep[] = buildLearnSteps({
  words: WORDS.map((w) => ({ ...w })),
  distractorPool: ["khởi hành", "tiền hoàn lại"],
  rng: () => 0.5,
});

function grade(overrides: Partial<GradeResult> = {}): GradeResult {
  return {
    correct: true,
    grade: null,
    xpAwarded: 1,
    xpCapped: false,
    totalXp: 10,
    streak: 3,
    goalDone: false,
    ...overrides,
  };
}

const typeGrade = (reps = 1, intervalDays = 1) =>
  grade({
    xpAwarded: 5, // 1 bước + 4 learn-complete
    grade: {
      quality: 4,
      ease: 2.6,
      intervalDays,
      reps,
      dueAt: "2026-10-11T00:00:00.000Z",
      lapses: 0,
    },
  });

function initialState(steps = STEPS): SessionState {
  return createSessionState(steps, "learn");
}

const stepOf = (steps: SessionStep[], kind: string, wordId: number) =>
  steps.find((s) => s.kind === kind && s.wordId === wordId)!;

describe("createSessionState", () => {
  it("queue = steps gốc; slots theo thứ tự word xuất hiện, không trùng", () => {
    const state = initialState();
    expect(state.queue).toHaveLength(STEPS.length);
    expect(sessionSlots(state).map((s) => s.wordId)).toEqual([1, 2]);
    expect(state.attempts.get(1)).toBe(1);
  });

  it("learn: chain per từ = các bước test (không introduce) — dùng requeue", () => {
    const state = initialState();
    expect(state.chains.get(1)!.map((s) => s.kind)).toEqual([
      "mc",
      "listen",
      "type",
    ]);
    expect(state.seenWords.get(1)).toBe("commute"); // introduce lộ word hợp lệ
  });

  it("không có introduce (review) → word chưa được thấy — type feedback không echo", () => {
    const reviewSteps: SessionStep[] = [
      {
        stepIndex: 0,
        kind: "mc",
        wordId: 9,
        word: "depart",
        ipa: null,
        options: ["khởi hành", "hành lý"],
      },
      { stepIndex: 1, kind: "type", wordId: 9, meaningVi: "khởi hành" },
    ];
    const state = createSessionState(reviewSteps, "review");
    expect(state.seenWords.get(9)).toBe("depart"); // mc lộ word
    const listenOnly: SessionStep[] = [
      {
        stepIndex: 0,
        kind: "listen",
        wordId: 9,
        audioUrl: "a.mp3",
        options: ["khởi hành", "hành lý"],
      },
      { stepIndex: 1, kind: "type", wordId: 9, meaningVi: "khởi hành" },
    ];
    const s2 = createSessionState(listenOnly, "review");
    expect(s2.seenWords.get(9)).toBeUndefined();
  });
});

describe("submit / graded", () => {
  it("submit khóa double-submit; graded mở và set feedback", () => {
    let state = initialState();
    const mc = stepOf(STEPS, "mc", 1);
    state = sessionReducer(state, { type: "submit" });
    expect(state.submitting).toBe(true);
    state = sessionReducer(state, { type: "graded", step: mc, result: grade() });
    expect(state.submitting).toBe(false);
    expect(state.feedback?.result.correct).toBe(true);
  });

  it("đúng bước test → đúng 1 lần-đếm-bước + XP cộng; type đúng → planted + stage từ grade", () => {
    let state = initialState();
    state = sessionReducer(state, {
      type: "graded",
      step: stepOf(STEPS, "mc", 1),
      result: grade(),
    });
    state = sessionReducer(state, { type: "advance" });
    state = sessionReducer(state, {
      type: "graded",
      step: stepOf(STEPS, "type", 1),
      result: typeGrade(1, 1),
    });
    const r1 = state.results.get(1)!;
    expect(r1.correctSteps).toBe(2);
    expect(r1.completed).toBe(true);
    expect(state.xpTotal).toBe(6); // 1 + 5
    expect(state.correctSteps).toBe(2);
    expect(r1.stage).toBe(1); // reps 1, interval 1 → Nảy mầm
    expect(sessionSummary(state).planted).toBe(1);
  });

  it("sai → không cộng XP/bước; feedback wrong", () => {
    let state = initialState();
    state = sessionReducer(state, {
      type: "graded",
      step: stepOf(STEPS, "mc", 1),
      result: grade({ correct: false, xpAwarded: 0 }),
    });
    expect(state.feedback?.result.correct).toBe(false);
    expect(state.correctSteps).toBe(0);
    expect(state.xpTotal).toBe(0);
    expect(state.results.get(1)?.completed ?? false).toBe(false);
  });

  it("xpCapped từ response OR-dồn; post-failed giữ bước + flag lỗi", () => {
    let state = initialState();
    state = sessionReducer(state, {
      type: "graded",
      step: stepOf(STEPS, "mc", 1),
      result: grade({ xpCapped: true }),
    });
    expect(state.xpCapped).toBe(true);
    state = sessionReducer(state, { type: "advance" });
    state = sessionReducer(state, { type: "post-failed" });
    expect(state.postError).toBe(true);
    expect(state.queue).toHaveLength(7); // post-failed KHÔNG advance — queue nguyên
    state = sessionReducer(state, { type: "submit" });
    expect(state.postError).toBe(false); // thử lại xóa flag
  });
});

describe("advance — requeue từ-sai về CUỐI hàng (contract client)", () => {
  /** Phiên thật đi qua 2 introduce (batch 2 từ) trước khi tới bước test. */
  function pastIntros(state: SessionState): SessionState {
    return sessionReducer(
      sessionReducer(state, { type: "advance" }),
      { type: "advance" },
    );
  }

  it("đúng → shift queue, feedback clear", () => {
    let state = pastIntros(initialState());
    state = sessionReducer(state, {
      type: "graded",
      step: stepOf(STEPS, "mc", 1),
      result: grade(),
    });
    state = sessionReducer(state, { type: "advance" });
    expect(state.feedback).toBeNull();
    expect(state.queue[0]?.kind).toBe("listen"); // tiếp chain từ 1
  });

  it("sai mc từ 1 → đuôi chain từ-1 (mc→listen→type) xuống cuối, attemptNo=2, đầu hàng là bước kế", () => {
    let state = pastIntros(initialState());
    state = sessionReducer(state, {
      type: "graded",
      step: stepOf(STEPS, "mc", 1),
      result: grade({ correct: false, xpAwarded: 0 }),
    });
    state = sessionReducer(state, { type: "advance" });
    // Sai tại mc thì từ 1 quay lại cuối hàng NGUYÊN chain, đầu hàng chuyển
    // sang từ 2 (giữ nhịp phiên — không re-test ngay cùng từ)
    expect(state.queue[0]).toMatchObject({ kind: "mc", wordId: 2 });
    const tail = state.queue.slice(-3).map((s) => `${s.kind}#${s.wordId}`);
    expect(tail).toEqual(["mc#1", "listen#1", "type#1"]);
    expect(state.attempts.get(1)).toBe(2);
  });

  it("sai type từ 1 (đã qua mc/listen) → chỉ type xuống cuối", () => {
    let state = pastIntros(initialState());
    for (const kind of ["mc", "listen"] as const) {
      state = sessionReducer(state, {
        type: "graded",
        step: stepOf(STEPS, kind, 1),
        result: grade(),
      });
      state = sessionReducer(state, { type: "advance" });
    }
    state = sessionReducer(state, {
      type: "graded",
      step: stepOf(STEPS, "type", 1),
      result: grade({ correct: false, xpAwarded: 0 }),
    });
    state = sessionReducer(state, { type: "advance" });
    expect(state.queue.at(-1)).toMatchObject({ kind: "type", wordId: 1 });
    expect(state.queue).toHaveLength(4); // mc#2 listen#2 type#2 + type#1 requeue
    expect(state.attempts.get(1)).toBe(2);
  });

  it("advance không feedback (introduce) → shift thuần; queue cạn → summary", () => {
    let state = initialState();
    const intro = state.queue[0]!;
    expect(intro.kind).toBe("introduce");
    state = sessionReducer(state, { type: "advance" });
    expect(state.queue[0]?.kind).toBe("introduce"); // batch 2 intro liên tiếp
    // đi hết: 2 intro + (mc,listen,type)×2 — dùng advance trần khi không graded
    while (state.queue.length > 0) {
      state = sessionReducer(state, { type: "advance" });
    }
    expect(state.queue).toHaveLength(0);
    expect(sessionSummary(state).planted).toBe(0);
  });
});

describe("sessionSlots + sessionSummary (render + tổng kết)", () => {
  it("slot: done khi planted, active = word đầu hàng, lại pending khi requeue chờ", () => {
    let state = initialState();
    state = sessionReducer(state, {
      type: "graded",
      step: stepOf(STEPS, "type", 1),
      result: typeGrade(),
    });
    // từ 1 planted nhưng vẫn còn listen#1 trước type#1? — chain thứ tự mc→listen→type
    // nên planted chỉ xảy ra sau khi queue của từ 1 đi hết; từ 2 chưa chạm
    const slots = sessionSlots(state);
    expect(slots.find((s) => s.wordId === 1)?.state).toBe("done");
    expect(slots.find((s) => s.wordId === 2)?.state).toBe("pending");
  });

  it("summary gom planted/stage max/xp/capped/correctSteps", () => {
    let state = initialState();
    state = sessionReducer(state, {
      type: "graded",
      step: stepOf(STEPS, "type", 1),
      result: typeGrade(1, 1),
    });
    state = sessionReducer(state, {
      type: "graded",
      step: stepOf(STEPS, "type", 2),
      result: typeGrade(3, 6),
    });
    const sum = sessionSummary(state);
    expect(sum.planted).toBe(2);
    expect(sum.maxStage).toBe(2); // interval 6 → Cây con
    expect(sum.xpTotal).toBe(10);
    expect(sum.xpCapped).toBe(false);
  });
});
