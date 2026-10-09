/**
 * Session DB leg (vocab-memrise SF-2, VU-39 — context pack #6, epic §5).
 * Stateless: `sessionKey` = UUID server sinh ở GET, CHỈ audit/idempotency —
 * KHÔNG session table; queue re-derive mỗi GET (reload = GET lại).
 *
 * Bounded queries (cấm load-all — bài học daily-plan-store 5000 rows, §6.8
 * query-shape pin trong learn-session-store.test.ts):
 * - learn: book check (1) → pool distractor LIMIT 500 (2) → order TỐI THIỂU
 *   của từ reps=0 LIMIT 1 (3) → count vị trí (4) → window chunk OFFSET
 *   floor(count/10)*10 LIMIT 10 JOIN words+reps (5) → `nextLevel` (levels.ts)
 *   → queue = unplanted take LEARN_SESSION_WORDS.
 * - review: due `due_at <= now()` SQL-side trên index (user_id, due_at),
 *   oldest-due-first, LIMIT DUE_LIMIT (50); prefill ?word= → 1 từ theo
 *   progress row (không đòi due — prefill là ý user).
 * Auth là việc ROUTE — store chỉ nhận userId đã qua session.
 */
import { and, asc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookWords, books, userWordProgress, words } from "@/db/schema";
import {
  buildLearnSteps,
  buildReviewSteps,
  LEARN_SESSION_WORDS,
  type SessionKind,
  type SessionStep,
  type SessionWord,
} from "./learn-session";
import { nextLevel, WORDS_PER_LEVEL } from "./levels";

export const DUE_LIMIT = 50;
/** Pool nhiễu MC — meaning_vi đầu sách theo order; bounded thay vì load-all. */
export const DISTRACTOR_POOL_LIMIT = 500;

export type SessionOutcome =
  | {
      ok: true;
      sessionKey: string;
      kind: SessionKind;
      bookId: number | null;
      steps: SessionStep[];
    }
  | { ok: false; error: "invalidBook" | "wordNotFound" };

function newSessionKey(): string {
  return crypto.randomUUID();
}

const toSessionWord = (row: {
  wordId: number;
  word: string;
  ipa: string | null;
  meaningVi: string;
  audioUrl: string | null;
  example: string | null;
}): SessionWord => row;

/** Pool distractor: meaning_vi các từ cùng book (bounded, DISTINCT ở engine). */
async function distractorPool(bookId: number): Promise<string[]> {
  const rows = await db
    .select({ meaningVi: words.meaningVi })
    .from(bookWords)
    .innerJoin(words, eq(words.id, bookWords.wordId))
    .where(eq(bookWords.bookId, bookId))
    .orderBy(asc(bookWords.order))
    .limit(DISTRACTOR_POOL_LIMIT);
  return rows.map((r) => r.meaningVi);
}

/**
 * Phiên LEARN cho (user, book) — level kế tiếp theo rule §2.5 (chunk ĐẦU
 * TIÊN còn ≥1 từ reps=0; seed learn-flow reps=0 vẫn thuộc queue). Hết từ →
 * {ok, steps:[]} (continue card "hoàn thành" — SF-4).
 */
export async function getLearnSession(
  userId: string,
  bookId: number,
): Promise<SessionOutcome> {
  const [book] = await db
    .select({ id: books.id })
    .from(books)
    .where(eq(books.id, bookId))
    .limit(1);
  if (!book) return { ok: false, error: "invalidBook" };

  const pool = await distractorPool(bookId);

  // Order TỐI THỂU của từ reps=0 (LEFT JOIN — từ chưa có row progress = 0)
  const [minUnplanted] = await db
    .select({ order: bookWords.order })
    .from(bookWords)
    .leftJoin(
      userWordProgress,
      and(
        eq(userWordProgress.wordId, bookWords.wordId),
        eq(userWordProgress.userId, userId),
      ),
    )
    .where(
      and(
        eq(bookWords.bookId, bookId),
        sql`coalesce(${userWordProgress.reps}, 0) = 0`,
      ),
    )
    .orderBy(asc(bookWords.order))
    .limit(1);
  if (!minUnplanted) return { ok: true, sessionKey: newSessionKey(), kind: "learn", bookId, steps: [] };

  // Chunk theo VỊ TRÍ order-sorted (levels.ts chunk theo vị trí, không giá trị
  // order) — đếm số từ trước minOrder → OFFSET đầu chunk
  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookWords)
    .where(
      and(eq(bookWords.bookId, bookId), lt(bookWords.order, minUnplanted.order)),
    );
  const chunkStart =
    Math.floor((countRow?.n ?? 0) / WORDS_PER_LEVEL) * WORDS_PER_LEVEL;

  const windowRows = await db
    .select({
      wordId: bookWords.wordId,
      order: bookWords.order,
      reps: sql<number>`coalesce(${userWordProgress.reps}, 0)::int`,
      word: words.word,
      ipa: words.ipa,
      meaningVi: words.meaningVi,
      audioUrl: words.audioUrl,
      example: words.example,
    })
    .from(bookWords)
    .innerJoin(words, eq(words.id, bookWords.wordId))
    .leftJoin(
      userWordProgress,
      and(
        eq(userWordProgress.wordId, bookWords.wordId),
        eq(userWordProgress.userId, userId),
      ),
    )
    .where(eq(bookWords.bookId, bookId))
    .orderBy(asc(bookWords.order))
    .offset(chunkStart)
    .limit(WORDS_PER_LEVEL);

  // nextLevel (levels.ts) trên window = chunk chứa minOrder (mỗi window đúng
  // 1 chunk) — defensively rỗng khi window lệch (data xoắn giữa 2 query —
  // hiếm, GET lại được). Queue = unplanted của chunk, tối đa LEARN_SESSION_WORDS.
  const chunk = nextLevel(windowRows);
  const byId = new Map(windowRows.map((r) => [r.wordId, r]));
  const unplanted = (chunk?.words ?? [])
    .filter((w) => w.reps === 0)
    .map((w) => byId.get(w.wordId))
    .filter((r) => r !== undefined)
    .slice(0, LEARN_SESSION_WORDS);
  const steps = buildLearnSteps({
    words: unplanted.map(toSessionWord),
    distractorPool: pool,
  });
  return { ok: true, sessionKey: newSessionKey(), kind: "learn", bookId, steps };
}

/**
 * Phiên REVIEW cho (user, scope) — due queue `due_at <= now()` SQL-side trên
 * index (user_id, due_at), LIMIT DUE_LIMIT, oldest-due-first; `?book=` thu
 * hẹp qua subquery book_words (pattern listDueWords); `?word=` prefill = 1
 * từ theo progress row (không đòi due — URL là ý user, POST vẫn validate).
 */
export async function getReviewSession(
  userId: string,
  scope: { bookId?: number; wordId?: number },
): Promise<SessionOutcome> {
  const { bookId, wordId } = scope;

  if (bookId !== undefined) {
    const [book] = await db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.id, bookId))
      .limit(1);
    if (!book) return { ok: false, error: "invalidBook" };
  }

  let queue: SessionWord[];
  if (wordId !== undefined) {
    const [prefill] = await db
      .select({
        wordId: words.id,
        word: words.word,
        ipa: words.ipa,
        meaningVi: words.meaningVi,
        audioUrl: words.audioUrl,
        example: words.example,
      })
      .from(userWordProgress)
      .innerJoin(words, eq(words.id, userWordProgress.wordId))
      .where(
        and(
          eq(userWordProgress.userId, userId),
          eq(userWordProgress.wordId, wordId),
        ),
      )
      .limit(1);
    if (!prefill) return { ok: false, error: "wordNotFound" };
    queue = [prefill];
  } else {
    const conditions = [
      eq(userWordProgress.userId, userId),
      lte(userWordProgress.dueAt, sql`now()`),
    ];
    if (bookId !== undefined) {
      conditions.push(
        inArray(
          words.id,
          db
            .select({ id: bookWords.wordId })
            .from(bookWords)
            .where(eq(bookWords.bookId, bookId)),
        ),
      );
    }
    queue = await db
      .select({
        wordId: words.id,
        word: words.word,
        ipa: words.ipa,
        meaningVi: words.meaningVi,
        audioUrl: words.audioUrl,
        example: words.example,
      })
      .from(userWordProgress)
      .innerJoin(words, eq(words.id, userWordProgress.wordId))
      .where(and(...conditions))
      .orderBy(asc(userWordProgress.dueAt))
      .limit(DUE_LIMIT);
  }

  // Pool distractor: book-scoped dùng pool sách; scope all dùng nghĩa due
  // rows (bounded ≤ DUE_LIMIT) — không quét cả bảng words
  const pool =
    bookId !== undefined
      ? await distractorPool(bookId)
      : queue.map((w) => w.meaningVi);

  const steps = buildReviewSteps({ words: queue, distractorPool: pool });
  return {
    ok: true,
    sessionKey: newSessionKey(),
    kind: "review",
    bookId: bookId ?? null,
    steps,
  };
}
