import { describe, expect, it } from "vitest";
import {
  QUIZ_SCOPE_MULTI_MAX_BOOKS,
  buildQuiz,
  gradeQuiz,
  parseQuizScope,
  type QuizAnswer,
  type QuizQuestion,
  type QuizWord,
} from "./quiz";

/**
 * Quiz engine PURE (SF-4 t-4.1) — sinh đề đủ 3 loại xen kẽ, từ không lặp,
 * phương án trắc nghiệm không trùng nhau và luôn chứa đáp án; pool rỗng →
 * đề rỗng; pool nhỏ → đề thu ngắn. rng injectable → test tất định (mulberry32).
 */

/** mulberry32 — rng tất định cho test. */
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePool(n: number): QuizWord[] {
  return Array.from({ length: n }, (_, i) => ({
    wordId: i + 1,
    word: `word${i + 1}`,
    meaningVi: `nghĩa ${i + 1}`,
    ipa: i % 2 === 0 ? `ipa${i + 1}` : null,
  }));
}

const FULL_SLOT_PATTERN = [
  "multiple-choice",
  "fill-word",
  "multiple-choice",
  "fill-word",
  "matching",
  "multiple-choice",
  "fill-word",
  "multiple-choice",
  "fill-word",
  "matching",
];

describe("buildQuiz", () => {
  it("pool đủ lớn → đúng 10 câu theo pattern xen kẽ 4 trắc nghiệm + 4 điền + 2 ghép", () => {
    const quiz = buildQuiz(makePool(30), seededRng(42));
    expect(quiz).toHaveLength(10);
    expect(quiz.map((q) => q.type)).toEqual(FULL_SLOT_PATTERN);
  });

  it("không từ nào lặp giữa các câu (trắc nghiệm + điền + ghép gộp lại 18 từ distinct)", () => {
    const quiz = buildQuiz(makePool(30), seededRng(7));
    const used: number[] = [];
    for (const q of quiz) {
      if (q.type === "matching") {
        used.push(...q.words.map((w) => w.wordId));
      } else {
        used.push(q.wordId);
      }
    }
    expect(new Set(used).size).toBe(used.length);
    expect(used).toHaveLength(18); // 4 mc + 4 fill + 2 ghép × 5 cặp
  });

  it("trắc nghiệm: 4 phương án không trùng, chứa đáp án, không lộ đáp án trong payload", () => {
    const pool = makePool(30);
    const quiz = buildQuiz(pool, seededRng(1));
    const mcQuestions = quiz.filter(
      (q): q is Extract<QuizQuestion, { type: "multiple-choice" }> =>
        q.type === "multiple-choice",
    );
    expect(mcQuestions).toHaveLength(4);
    for (const q of mcQuestions) {
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      const word = pool.find((w) => w.wordId === q.wordId)!;
      expect(q.options).toContain(word.meaningVi);
      expect(Object.keys(q).sort()).toEqual([
        "ipa",
        "options",
        "type",
        "word",
        "wordId",
      ]);
    }
  });

  it("điền từ: gợi ý là nghĩa VI + letterCount khớp độ dài word", () => {
    const pool = makePool(30);
    const quiz = buildQuiz(pool, seededRng(3));
    const fillQuestions = quiz.filter(
      (q): q is Extract<QuizQuestion, { type: "fill-word" }> =>
        q.type === "fill-word",
    );
    expect(fillQuestions).toHaveLength(4);
    for (const q of fillQuestions) {
      const word = pool.find((w) => w.wordId === q.wordId)!;
      expect(q.meaningVi).toBe(word.meaningVi);
      expect(q.letterCount).toBe(word.word.length);
    }
  });

  it("ghép nghĩa: 5 cặp, 5 nghĩa phân biệt, mỗi từ đều nằm trong pool", () => {
    const quiz = buildQuiz(makePool(30), seededRng(9));
    const matchQuestions = quiz.filter(
      (q): q is Extract<QuizQuestion, { type: "matching" }> =>
        q.type === "matching",
    );
    expect(matchQuestions).toHaveLength(2);
    for (const q of matchQuestions) {
      expect(q.words).toHaveLength(5);
      expect(q.meanings).toHaveLength(5);
      expect(new Set(q.meanings).size).toBe(5);
    }
  });

  it("pool rỗng → mảng rỗng", () => {
    expect(buildQuiz([], seededRng(5))).toEqual([]);
  });

  it("pool nhỏ (3 từ) → thu ngắn còn điền từ, không sinh trắc nghiệm/ghép", () => {
    const quiz = buildQuiz(makePool(3), seededRng(11));
    expect(quiz).toHaveLength(3);
    expect(quiz.every((q) => q.type === "fill-word")).toBe(true);
  });

  it("pool 8 từ → các câu trả về đều hợp lệ (không crash, không từ lặp)", () => {
    const pool = makePool(8);
    const quiz = buildQuiz(pool, seededRng(13));
    expect(quiz.length).toBeGreaterThan(0);
    const poolIds = new Set(pool.map((w) => w.wordId));
    const used: number[] = [];
    for (const q of quiz) {
      if (q.type === "matching") {
        expect(q.words).toHaveLength(5);
        used.push(...q.words.map((w) => w.wordId));
      } else {
        used.push(q.wordId);
      }
    }
    expect(used.every((id) => poolIds.has(id))).toBe(true);
    expect(new Set(used).size).toBe(used.length);
  });

  it("cùng seed → đề giống hệt nhau (tất định), seed khác → đề khác", () => {
    const pool = makePool(30);
    const a = JSON.stringify(buildQuiz(pool, seededRng(99)));
    const b = JSON.stringify(buildQuiz(pool, seededRng(99)));
    const c = JSON.stringify(buildQuiz(pool, seededRng(100)));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
})

describe("gradeQuiz", () => {
  const pool = makePool(6);

  function answer(
    wordId: number,
    type: QuizAnswer["type"],
    response: string,
  ): QuizAnswer {
    return { wordId, type, response };
  }

  it("trắc nghiệm/ghép so nghĩa VI, điền từ so word — đúng/sai chấm đúng", () => {
    const grade = gradeQuiz(pool, [
      answer(1, "multiple-choice", "nghĩa 1"),
      answer(2, "multiple-choice", "nghĩa sai"),
      answer(3, "fill-word", "word3"),
      answer(4, "fill-word", "sai"),
      answer(5, "matching", "nghĩa 5"),
      answer(6, "matching", "nghĩa khác"),
    ]);
    expect(grade.correct).toBe(3);
    expect(grade.total).toBe(6);
    expect(grade.score).toBeCloseTo(0.5, 10);
    expect(grade.detail.map((d) => d.correct)).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it("chuẩn hoá hoa/thường + khoảng trắng (trim + lowercase)", () => {
    const fill = gradeQuiz(pool, [answer(1, "fill-word", "  WORD1 ")]);
    expect(fill.detail[0]?.correct).toBe(true);
    const mc = gradeQuiz(pool, [answer(2, "multiple-choice", " NGHĨA 2 ")]);
    expect(mc.detail[0]?.correct).toBe(true);
  });

  it("wordId ngoài pool → sai (phòng thủ), không crash", () => {
    const grade = gradeQuiz(pool, [answer(999, "fill-word", "word1")]);
    expect(grade.total).toBe(1);
    expect(grade.correct).toBe(0);
    expect(grade.score).toBe(0);
  });

  it("không có đáp án nào → score 0 (route đã chặn mảng rỗng trước)", () => {
    expect(gradeQuiz(pool, [])).toMatchObject({ score: 0, correct: 0, total: 0 });
  });

  it("đủ đúng → score 1", () => {
    const grade = gradeQuiz(pool, [
      answer(1, "multiple-choice", "Nghĩa 1"),
      answer(2, "fill-word", "word2"),
    ]);
    expect(grade.score).toBe(1);
  });
});

describe("parseQuizScope (SF-3 t-3.2)", () => {
  it('scope "all" → {kind:"all"}', () => {
    expect(parseQuizScope({ scope: "all" })).toEqual({
      ok: true,
      scope: { kind: "all" },
    });
  });

  it('scope "book" + bookId nguyên dương (number lẫn string) → scope book', () => {
    expect(parseQuizScope({ scope: "book", bookId: 3 })).toEqual({
      ok: true,
      scope: { kind: "book", bookId: 3 },
    });
    expect(parseQuizScope({ scope: "book", bookId: "7" })).toEqual({
      ok: true,
      scope: { kind: "book", bookId: 7 },
    });
  });

  it.each([undefined, 0, -1, "abc", 2.5, null])(
    "scope book + bookId %j → invalidBookId",
    (bookId) => {
      expect(parseQuizScope({ scope: "book", bookId })).toEqual({
        ok: false,
        error: "invalidBookId",
      });
    },
  );

  it('scope "multi" + book_ids mảng → parse int, gộp trùng, giữ thứ tự', () => {
    expect(parseQuizScope({ scope: "multi", bookIds: [3, "1", 3, 2] })).toEqual({
      ok: true,
      scope: { kind: "multi", bookIds: [3, 1, 2] },
    });
  });

  it('scope "multi" + book_ids chuỗi querystring "1,2,3" → parse như mảng', () => {
    expect(parseQuizScope({ scope: "multi", bookIds: "1,2,3" })).toEqual({
      ok: true,
      scope: { kind: "multi", bookIds: [1, 2, 3] },
    });
  });

  it.each([
    [undefined, "thiếu bookIds"],
    ["", "bookIds rỗng"],
    [[], "mảng rỗng"],
    [[0], "chứa 0"],
    [[-2], "chứa âm"],
    [[1, "x"], "lẫn chữ"],
    [[1, null], "lẫn null"],
    [
      Array.from({ length: QUIZ_SCOPE_MULTI_MAX_BOOKS + 1 }, (_, i) => i + 1),
      "vượt trần 50 book",
    ],
  ])("scope multi %j (%s) → invalidBookIds", (bookIds, label) => {
    expect(parseQuizScope({ scope: "multi", bookIds }), label).toEqual({
      ok: false,
      error: "invalidBookIds",
    });
  });

  it.each(["", "gia-lập", "BOOK", 42, null])(
    "scope %j → invalidScope (chỉ nhận all/book/multi nguyên văn)",
    (scope) => {
      expect(parseQuizScope({ scope: String(scope ?? "") })).toEqual({
        ok: false,
        error: "invalidScope",
      });
    },
  );
});
