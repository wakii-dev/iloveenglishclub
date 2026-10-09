import { describe, expect, it } from "vitest";

/**
 * Session engine thuần (SF-2, VU-39) — contract pin theo context pack #1-5 +
 * epic §2.1/§2.2: payload không đáp án, chuỗi per từ, degenerate pool,
 * interleave server-owned, typo tolerance, grade map MỘT grade/từ/lượt.
 */
import {
  buildLearnSteps,
  buildReviewSteps,
  gradeStep,
  isSessionKind,
  isStepKind,
  LEARN_SESSION_WORDS,
  normalizeAnswer,
  SESSION_KINDS,
  STEP_KINDS,
  type SessionStep,
  type SessionWord,
} from "./learn-session";

/** rng tất định — LCG seeded (options order xác định, không phụ Math.random). */
function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function mkWord(
  wordId: number,
  word: string,
  meaningVi: string,
  audioUrl: string | null = `https://cdn.test/${word}.mp3`,
): SessionWord {
  return {
    wordId,
    word,
    ipa: `/ipa/${word}/`,
    meaningVi,
    example: `Example with ${word}.`,
    audioUrl,
  };
}

/** Chuỗi kind:wordId gọn để assert thứ tự step. */
const shape = (steps: readonly SessionStep[]): string[] =>
  steps.map((s) => `${s.kind}#${s.wordId}`);

describe("guards — taxonomy đầu vào route", () => {
  it("isSessionKind nhận đúng 2 kind, chặn lạ", () => {
    expect(SESSION_KINDS).toEqual(["learn", "review"]);
    expect(isSessionKind("learn")).toBe(true);
    expect(isSessionKind("review")).toBe(true);
    expect(isSessionKind("quiz")).toBe(false);
    expect(isSessionKind("")).toBe(false);
    expect(isSessionKind(1)).toBe(false);
    expect(isSessionKind(null)).toBe(false);
  });

  it("isStepKind nhận đúng 4 kind, chặn lạ", () => {
    expect(STEP_KINDS).toEqual(["introduce", "mc", "listen", "type"]);
    expect(isStepKind("introduce")).toBe(true);
    expect(isStepKind("mc")).toBe(true);
    expect(isStepKind("listen")).toBe(true);
    expect(isStepKind("type")).toBe(true);
    expect(isStepKind("matching")).toBe(false);
    expect(isStepKind("introduce ")).toBe(false);
  });

  it("LEARN_SESSION_WORDS = 5 — phiên learn 5 từ (pin acceptance)", () => {
    expect(LEARN_SESSION_WORDS).toBe(5);
  });
});

describe("buildLearnSteps — chuỗi per từ + interleave (context pack #2)", () => {
  it("5 từ đủ audio: intro 2 mới → test-chain xen kẽ, chuỗi per từ introduce→mc→listen→type", () => {
    const words = [
      mkWord(1, "apple", "quả táo"),
      mkWord(2, "house", "ngôi nhà"),
      mkWord(3, "water", "nước"),
      mkWord(4, "book", "quyển sách"),
      mkWord(5, "friend", "người bạn"),
    ];
    const pool = [
      "quả táo",
      "ngôi nhà",
      "nước",
      "quyển sách",
      "người bạn",
      "con mèo",
      "chiếc xe",
      "cái bàn",
    ];
    const steps = buildLearnSteps({ words, distractorPool: pool, rng: seededRng(42) });
    // Đan xen batch 2 từ mới: [A,B] [C,D] [E] — intro của từ mới chen giữa
    // các test-chain; chuỗi per từ giữ nguyên mc→listen→type.
    expect(shape(steps)).toEqual([
      "introduce#1",
      "introduce#2",
      "mc#1",
      "listen#1",
      "type#1",
      "mc#2",
      "listen#2",
      "type#2",
      "introduce#3",
      "introduce#4",
      "mc#3",
      "listen#3",
      "type#3",
      "mc#4",
      "listen#4",
      "type#4",
      "introduce#5",
      "mc#5",
      "listen#5",
      "type#5",
    ]);
    expect(steps.map((s) => s.stepIndex)).toEqual(steps.map((_, i) => i));
  });

  it("listen CHỈ khi audioUrl != null — từ không audio bỏ step, chuỗi intro→mc→type", () => {
    const words = [mkWord(1, "apple", "quả táo", null)];
    const pool = ["quả táo", "ngôi nhà", "nước", "quyển sách"];
    const steps = buildLearnSteps({ words, distractorPool: pool, rng: seededRng(1) });
    expect(shape(steps)).toEqual(["introduce#1", "mc#1", "type#1"]);
  });

  it("pool <4 nghĩa phân biệt → MC giảm số lựa chọn (6 từ prod shape — 3 nghĩa)", () => {
    // 6 từ prod shape: 3 nghĩa phân biệt → MC 3 lựa chọn
    const words = [
      mkWord(1, "run", "chạy"),
      mkWord(2, "walk", "đi bộ"),
      mkWord(3, "jump", "nhảy"),
      mkWord(4, "sprint", "chạy"),
      mkWord(5, "stroll", "đi bộ"),
      mkWord(6, "leap", "nhảy"),
    ];
    const pool = words.map((w) => w.meaningVi);
    const steps = buildLearnSteps({ words, distractorPool: pool, rng: seededRng(7) });
    const mcSteps = steps.filter((s) => s.kind === "mc");
    expect(mcSteps.length).toBeGreaterThan(0);
    for (const mc of mcSteps) {
      expect(mc.options?.length).toBe(3);
    }
  });

  it("pool <2 nghĩa phân biệt → BỎ step MC (không crash — sách 1 nghĩa)", () => {
    const words = [mkWord(1, "run", "chạy", null)];
    const pool = ["chạy"];
    const steps = buildLearnSteps({ words, distractorPool: pool, rng: seededRng(3) });
    expect(shape(steps)).toEqual(["introduce#1", "type#1"]);
  });

  it("words rỗng → steps rỗng", () => {
    expect(buildLearnSteps({ words: [], distractorPool: [], rng: seededRng(1) })).toEqual([]);
  });
});

describe("buildLearnSteps — payload KHÔNG lộ đáp án (epic MUST-NOT)", () => {
  const words = [
    mkWord(1, "apple", "quả táo"),
    mkWord(2, "house", "ngôi nhà", null),
  ];
  const pool = ["quả táo", "ngôi nhà", "nước", "quyển sách"];
  const steps = buildLearnSteps({ words, distractorPool: pool, rng: seededRng(11) });

  it("không field đáp án nào trên mọi step", () => {
    for (const step of steps) {
      const keys = Object.keys(step);
      expect(keys).not.toContain("answer");
      expect(keys).not.toContain("correct");
      expect(keys).not.toContain("isCorrect");
      expect(keys).not.toContain("answerIndex");
    }
  });

  it("mc: options gồm nghĩa đúng (không đánh dấu), KHÔNG meaningVi riêng", () => {
    const mc = steps.find((s) => s.kind === "mc");
    expect(mc).toBeDefined();
    expect(mc?.word).toBe("apple");
    expect(mc?.meaningVi).toBeUndefined();
    expect(mc?.options).toContain("quả táo");
    // đúng 1 option khớp nghĩa (không trùng normKey)
    const normalized = mc?.options?.map((o) => o.trim().toLowerCase());
    expect(normalized?.filter((o) => o === "quả táo").length).toBe(1);
  });

  it("listen/type ẩn word + ipa (nghe-chọn/gõ-từ không nhìn chữ); type chỉ có meaningVi prompt", () => {
    const listen = steps.find((s) => s.kind === "listen");
    expect(listen?.audioUrl).toBeTruthy();
    expect(listen?.word).toBeUndefined();
    expect(listen?.ipa).toBeUndefined();
    expect(listen?.options).toContain("quả táo");

    const type = steps.find((s) => s.kind === "type");
    expect(type?.word).toBeUndefined();
    expect(type?.meaningVi).toBe("quả táo"); // PROMPT — không phải đáp án chữ
    expect(type?.options).toBeUndefined();
  });

  it("introduce: đủ card word+ipa+meaningVi+example+audio", () => {
    const intro = steps.find((s) => s.kind === "introduce");
    expect(intro?.word).toBe("apple");
    expect(intro?.ipa).toBe("/ipa/apple/");
    expect(intro?.meaningVi).toBe("quả táo");
    expect(intro?.example).toContain("apple");
    expect(intro?.audioUrl).toBeTruthy();
  });
});

describe("buildReviewSteps — per từ (listen|mc)→type (context pack #3)", () => {
  it("có audio → listen; không audio → mc nghĩa; mỗi từ kết bằng type", () => {
    const words = [mkWord(1, "apple", "quả táo"), mkWord(2, "house", "ngôi nhà", null)];
    const pool = ["quả táo", "ngôi nhà", "nước", "quyển sách"];
    const steps = buildReviewSteps({ words, distractorPool: pool, rng: seededRng(5) });
    expect(shape(steps)).toEqual(["listen#1", "type#1", "mc#2", "type#2"]);
    expect(steps.map((s) => s.stepIndex)).toEqual([0, 1, 2, 3]);
  });

  it("KHÔNG introduce step trong review", () => {
    const words = [mkWord(1, "apple", "quả táo", null)];
    const pool = ["quả táo", "ngôi nhà", "nước"];
    const steps = buildReviewSteps({ words, distractorPool: pool, rng: seededRng(2) });
    expect(steps.every((s) => s.kind !== "introduce")).toBe(true);
  });

  it("degenerate: không audio + pool <2 nghĩa → chỉ type (bỏ mc)", () => {
    const words = [mkWord(1, "run", "chạy", null)];
    const pool = ["chạy"];
    const steps = buildReviewSteps({ words, distractorPool: pool, rng: seededRng(4) });
    expect(shape(steps)).toEqual(["type#1"]);
  });

  it("no-leak: listen ẩn word/ipa; mc hiện word + không meaningVi; type chỉ prompt", () => {
    const words = [mkWord(1, "apple", "quả táo"), mkWord(2, "house", "ngôi nhà", null)];
    const pool = ["quả táo", "ngôi nhà", "nước", "quyển sách"];
    const steps = buildReviewSteps({ words, distractorPool: pool, rng: seededRng(6) });
    const listen = steps.find((s) => s.kind === "listen");
    expect(listen?.word).toBeUndefined();
    expect(listen?.ipa).toBeUndefined();
    expect(listen?.options).toContain("quả táo");
    const mc = steps.find((s) => s.kind === "mc");
    expect(mc?.word).toBe("house");
    expect(mc?.meaningVi).toBeUndefined();
    expect(mc?.options).toContain("ngôi nhà");
    const type = steps.find((s) => s.kind === "type" && s.wordId === 2);
    expect(type?.word).toBeUndefined();
    expect(type?.meaningVi).toBe("ngôi nhà");
  });

  it("words rỗng (due hết) → steps rỗng", () => {
    expect(buildReviewSteps({ words: [], distractorPool: [], rng: seededRng(1) })).toEqual([]);
  });

  it("prefill 1 từ = queue 1 từ — cùng contract (store truyền 1 word)", () => {
    const words = [mkWord(9, "water", "nước", null)];
    const pool = ["nước", "quả táo", "ngôi nhà"];
    const steps = buildReviewSteps({ words, distractorPool: pool, rng: seededRng(8) });
    expect(shape(steps)).toEqual(["mc#9", "type#9"]);
  });
});

describe("normalizeAnswer + gradeStep — typo tolerance (context pack #4)", () => {
  it("normalize: trim + lowercase + collapse space", () => {
    expect(normalizeAnswer("  Apple  ")).toBe("apple");
    expect(normalizeAnswer("quả   TÁO")).toBe("quả táo");
    expect(normalizeAnswer("A\tB")).toBe("a b");
  });

  it("type so từ — normalize trước khi so", () => {
    const apple = { word: "apple", meaningVi: "quả táo" };
    expect(gradeStep({ stepKind: "type", response: "apple", word: apple })).toBe(true);
    expect(gradeStep({ stepKind: "type", response: "  APPLE ", word: apple })).toBe(true);
    expect(gradeStep({ stepKind: "type", response: "orange", word: apple })).toBe(false);
  });

  it("typo table — từ ≥5 ký tự: edit distance ≤1 tính ĐÚNG (số pin)", () => {
    const apple = { word: "apple", meaningVi: "quả táo" }; // len 5
    expect(gradeStep({ stepKind: "type", response: "apples", word: apple })).toBe(true); // +1 chèn
    expect(gradeStep({ stepKind: "type", response: "aple", word: apple })).toBe(true); // -1 xóa
    expect(gradeStep({ stepKind: "type", response: "apply", word: apple })).toBe(true); // 1 thay
    expect(gradeStep({ stepKind: "type", response: "applepie", word: apple })).toBe(false); // cách 3
    expect(gradeStep({ stepKind: "type", response: "pple", word: apple })).toBe(true); // -1 đầu chuỗi

    const house = { word: "house", meaningVi: "ngôi nhà" }; // len 5 biên
    expect(gradeStep({ stepKind: "type", response: "hous", word: house })).toBe(true);
    expect(gradeStep({ stepKind: "type", response: "mouse", word: house })).toBe(true);
    expect(gradeStep({ stepKind: "type", response: "hours", word: house })).toBe(false); // 2 thay
  });

  it("typo table — từ <5 ký tự: CHỈ exact (không typo tolerance)", () => {
    const run = { word: "run", meaningVi: "chạy" };
    expect(gradeStep({ stepKind: "type", response: "run", word: run })).toBe(true);
    expect(gradeStep({ stepKind: "type", response: "Run", word: run })).toBe(true);
    expect(gradeStep({ stepKind: "type", response: "rn", word: run })).toBe(false); // -1 nhưng từ ngắn
    expect(gradeStep({ stepKind: "type", response: "runs", word: run })).toBe(false);
    const book = { word: "book", meaningVi: "quyển sách" }; // len 4
    expect(gradeStep({ stepKind: "type", response: "bok", word: book })).toBe(false);
  });

  it("mc/listen so meaning — normalize + collapse space; rỗng → sai", () => {
    const apple = { word: "apple", meaningVi: "quả táo" };
    expect(gradeStep({ stepKind: "mc", response: "quả táo", word: apple })).toBe(true);
    expect(gradeStep({ stepKind: "mc", response: " Quả  TÁO ", word: apple })).toBe(true);
    expect(gradeStep({ stepKind: "mc", response: "quả xoài", word: apple })).toBe(false);
    expect(gradeStep({ stepKind: "listen", response: "quả táo", word: apple })).toBe(true);
    expect(gradeStep({ stepKind: "listen", response: "", word: apple })).toBe(false);
    expect(gradeStep({ stepKind: "type", response: "   ", word: apple })).toBe(false);
  });
});
