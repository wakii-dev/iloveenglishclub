import { describe, expect, it } from "vitest";

/**
 * Session engine thuần (SF-2, VU-39) — contract pin theo context pack #1-5 +
 * epic §2.1/§2.2: payload không đáp án, chuỗi per từ, degenerate pool,
 * interleave server-owned, typo tolerance, grade map MỘT grade/từ/lượt.
 */
import {
  buildLearnSteps,
  isSessionKind,
  isStepKind,
  LEARN_SESSION_WORDS,
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
