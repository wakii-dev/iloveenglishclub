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
import {
  bookWords,
  books,
  profiles,
  userWordProgress,
  vocabActivity,
  words,
} from "@/db/schema";
import { pgErrorCode } from "@/lib/actions/admin/pg-errors";
import { vnToday } from "@/lib/gamification/streak";
import { goalStatus } from "./daily-goal";
import {
  buildLearnSteps,
  buildReviewSteps,
  gradeStep,
  lapsesDelta,
  LEARN_SESSION_WORDS,
  qualityFromSteps,
  type GradeRequest,
  type GradeResult,
  type SessionKind,
  type SessionStep,
  type SessionWord,
} from "./learn-session";
import { nextLevel, WORDS_PER_LEVEL } from "./levels";
import { nextReview } from "./srs";
import { awardVocabXpTx } from "./vocab-xp-store";

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

// ─── applyStep — chấm 1 bước + ghi (context pack #7) ─────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

export type ApplyStepOutcome =
  | { ok: true; result: GradeResult }
  | { ok: false; error: "wordNotFound" | "sessionNotFound" };

/**
 * step_index sentinel cho row `learn-complete` — event CẤP TỪ (hoàn thành
 * lượt), không phải bước test; key idempotency PHÂN BIỆT với step row cùng
 * lượt (client stepIndex ≥ 0 — route validate chặn giá trị âm).
 */
export const LEARN_COMPLETE_STEP_INDEX = -1;

/** Scope phiên: learn = word ∈ book client khai; review = progress row của user. */
async function scopeWordRow(
  userId: string,
  req: GradeRequest,
): Promise<Pick<SessionWord, "word" | "meaningVi"> | null> {
  if (req.kind === "learn") {
    const [row] = await db
      .select({ word: words.word, meaningVi: words.meaningVi })
      .from(bookWords)
      .innerJoin(words, eq(words.id, bookWords.wordId))
      .where(
        and(
          eq(bookWords.bookId, req.bookId),
          eq(bookWords.wordId, req.wordId),
        ),
      )
      .limit(1);
    return row ?? null;
  }
  const [row] = await db
    .select({ word: words.word, meaningVi: words.meaningVi })
    .from(userWordProgress)
    .innerJoin(words, eq(words.id, userWordProgress.wordId))
    .where(
      and(
        eq(userWordProgress.userId, userId),
        eq(userWordProgress.wordId, req.wordId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Count event learn-complete hôm nay (VN) — planted-today cho goalDone. */
async function countLearnCompleteToday(
  exec: Exec,
  userId: string,
): Promise<number> {
  const [row] = await exec
    .select({
      n: sql<number>`count(*) filter (where ${vocabActivity.kind} = 'learn-complete' and (${vocabActivity.createdAt} at time zone 'Asia/Ho_Chi_Minh')::date = ${vnToday(new Date())}::date)::int`,
    })
    .from(vocabActivity)
    .where(eq(vocabActivity.userId, userId));
  return row?.n ?? 0;
}

/**
 * Duplicate idempotency — KẾT QUẢ CACHED, ZERO write ("KHÔNG ghi SRS lần 2",
 * acceptance 4): response dựng lại từ audit rows (vocab_activity là cache) —
 * `xpAwarded` = xp đã ghi trong row, grade = progress HIỆN TẠI (không đổi từ
 * lần trước). `xpCapped: false` cosmetic — row chỉ lưu xp (giá trị ĐÚNG),
 * flag cap không persist.
 */
async function reconstructCached(
  exec: Exec,
  userId: string,
  req: GradeRequest,
  cached: { correct: boolean; xp: number },
): Promise<GradeResult> {
  const [profile] = await exec
    .select({
      xp: profiles.xp,
      streakCount: profiles.streakCount,
      dailyGoalWords: profiles.dailyGoalWords,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  let grade: GradeResult["grade"] = null;
  if (req.stepKind === "type") {
    const attemptRows = await attemptCorrects(exec, userId, req);
    const [progress] = await exec
      .select({
        ease: userWordProgress.ease,
        intervalDays: userWordProgress.intervalDays,
        reps: userWordProgress.reps,
        lapses: userWordProgress.lapses,
        dueAt: userWordProgress.dueAt,
      })
      .from(userWordProgress)
      .where(
        and(
          eq(userWordProgress.userId, userId),
          eq(userWordProgress.wordId, req.wordId),
        ),
      )
      .limit(1);
    if (progress) {
      grade = {
        quality: qualityFromSteps(attemptRows.map((r) => r.correct)),
        ease: progress.ease,
        intervalDays: progress.intervalDays,
        reps: progress.reps,
        dueAt: progress.dueAt.toISOString(),
        lapses: progress.lapses,
      };
    }
  }

  const goalDone = goalStatus({
    plantedToday: await countLearnCompleteToday(exec, userId),
    goal: profile?.dailyGoalWords ?? 0,
  }).done;

  return {
    correct: cached.correct,
    grade,
    xpAwarded: cached.xp,
    xpCapped: false,
    totalXp: profile?.xp ?? 0,
    streak: profile?.streakCount ?? 0,
    goalDone,
  };
}

/** Kết quả các bước test của attempt (lượt) — kind='session-step' thôi. */
function attemptCorrects(exec: Exec, userId: string, req: GradeRequest) {
  return exec
    .select({ correct: vocabActivity.correct })
    .from(vocabActivity)
    .where(
      and(
        eq(vocabActivity.userId, userId),
        eq(vocabActivity.wordId, req.wordId),
        eq(vocabActivity.sessionKey, req.sessionKey),
        eq(vocabActivity.attemptNo, req.attemptNo),
        eq(vocabActivity.kind, "session-step"),
      ),
    );
}

/**
 * Chấm + ghi MỘT bước POST (spec §5, pattern submit-attempt.ts):
 *  1. scope (learn: word ∈ book; review: progress row) — hụt → 404 theo
 *     sessionKey activity (taxonomy sessionNotFound/wordNotFound)
 *  2. duplicate idempotency (composite key) → cached reconstruct ZERO write
 *  3. MỘT transaction: awardVocabXpTx (session-step XP anti-farm) → nếu bước
 *     type (từ hoàn thành lượt): quality từ attempt activities + nextReview
 *     upsert progress + lapses(q<3) + learn-complete award KHI reps 0→≥1
 *     (sentinel stepIndex -1 — key riêng với step row) → goalDone
 * 4 XP learn-complete = lần reps ĐẦU vượt 0 (từ sai q=0 giữ reps 0 → KHÔNG
 * award — trồng cây phải NỔY MẦM); retry attemptNo mới là instance mới.
 */
export async function applyStep(
  userId: string,
  req: GradeRequest,
): Promise<ApplyStepOutcome> {
  const wordRow = await scopeWordRow(userId, req);
  if (!wordRow) {
    // Taxonomy §5: scope hụt + sessionKey chưa có activity nào → phiên không
    // có thật (stale/forged); đã có activity → word thuộc phiên khác scope
    const [sessionRow] = await db
      .select({ id: vocabActivity.id })
      .from(vocabActivity)
      .where(
        and(
          eq(vocabActivity.userId, userId),
          eq(vocabActivity.sessionKey, req.sessionKey),
        ),
      )
      .limit(1);
    return {
      ok: false,
      error: sessionRow ? "wordNotFound" : "sessionNotFound",
    };
  }

  // Composite key = công thức SF-1 idempotencyKey — duplicate trả cached
  const [dup] = await db
    .select({
      correct: vocabActivity.correct,
      xp: vocabActivity.xp,
    })
    .from(vocabActivity)
    .where(
      and(
        eq(vocabActivity.userId, userId),
        eq(vocabActivity.sessionKey, req.sessionKey),
        eq(vocabActivity.wordId, req.wordId),
        eq(vocabActivity.stepIndex, req.stepIndex),
        eq(vocabActivity.attemptNo, req.attemptNo),
      ),
    )
    .limit(1);
  if (dup) {
    return { ok: true, result: await reconstructCached(db, userId, req, dup) };
  }

  const correct = gradeStep({
    stepKind: req.stepKind,
    response: req.response,
    word: wordRow,
  });

  try {
    const result = await db.transaction(async (tx): Promise<GradeResult> => {
      const stepXp = await awardVocabXpTx(tx, {
        userId,
        wordId: req.wordId,
        kind: "session-step",
        correct,
        sessionKey: req.sessionKey,
        stepIndex: req.stepIndex,
        attemptNo: req.attemptNo,
      });
      if (stepXp.error === "noProfile") {
        // Degenerate: user authed không có profile — FK cascade makes this
        // unreachable trong thực tế; map đúng taxonomy 404 (comment route)
        throw new WordNotFoundError();
      }
      if (stepXp.duplicate) {
        // Race: pre-check hụt, tx khác kịp ghi — reconstruct trong tx (read-only)
        const [row] = await tx
          .select({ correct: vocabActivity.correct, xp: vocabActivity.xp })
          .from(vocabActivity)
          .where(
            and(
              eq(vocabActivity.userId, userId),
              eq(vocabActivity.sessionKey, req.sessionKey),
              eq(vocabActivity.wordId, req.wordId),
              eq(vocabActivity.stepIndex, req.stepIndex),
              eq(vocabActivity.attemptNo, req.attemptNo),
            ),
          )
          .limit(1);
        return row
          ? await reconstructCached(tx, userId, req, row)
          : {
              correct,
              grade: null,
              xpAwarded: 0,
              xpCapped: false,
              totalXp: stepXp.totalXp,
              streak: stepXp.streak,
              goalDone: false,
            };
      }

      let grade: GradeResult["grade"] = null;
      let learnComplete: Awaited<ReturnType<typeof awardVocabXpTx>> | null =
        null;
      if (req.stepKind === "type") {
        // MỘT grade SM-2/từ/lượt — quality SUY từ attempt activities (vừa ghi
        // gồm bước này): mọi bước đúng q=4, bất kỳ sai q=0
        const attemptRows = await attemptCorrects(tx, userId, req);
        const quality = qualityFromSteps(attemptRows.map((r) => r.correct));
        const [current] = await tx
          .select({
            ease: userWordProgress.ease,
            intervalDays: userWordProgress.intervalDays,
            reps: userWordProgress.reps,
            lapses: userWordProgress.lapses,
          })
          .from(userWordProgress)
          .where(
            and(
              eq(userWordProgress.userId, userId),
              eq(userWordProgress.wordId, req.wordId),
            ),
          )
          .limit(1);
        const next = nextReview({
          ease: current?.ease,
          intervalDays: current?.intervalDays,
          reps: current?.reps,
          quality,
        });
        const newLapses = (current?.lapses ?? 0) + lapsesDelta(quality);
        const reviewedAt = new Date();
        await tx
          .insert(userWordProgress)
          .values({
            userId,
            wordId: req.wordId,
            ease: next.ease,
            intervalDays: next.intervalDays,
            dueAt: next.dueAt,
            reps: next.reps,
            lapses: newLapses,
            lastReviewedAt: reviewedAt,
          })
          .onConflictDoUpdate({
            target: [userWordProgress.userId, userWordProgress.wordId],
            set: {
              ease: next.ease,
              intervalDays: next.intervalDays,
              dueAt: next.dueAt,
              reps: next.reps,
              lapses: newLapses,
              lastReviewedAt: reviewedAt,
            },
          });
        // 4 XP chỉ khi reps ĐẦU TIÊN vượt 0 (learn mới planted) — q=0 giữ
        // reps 0 → không award; review (reps≥1) → không award
        if ((current?.reps ?? 0) === 0 && next.reps >= 1) {
          learnComplete = await awardVocabXpTx(tx, {
            userId,
            wordId: req.wordId,
            kind: "learn-complete",
            correct: true,
            sessionKey: req.sessionKey,
            stepIndex: LEARN_COMPLETE_STEP_INDEX,
            attemptNo: req.attemptNo,
          });
        }
        grade = {
          quality,
          ease: next.ease,
          intervalDays: next.intervalDays,
          reps: next.reps,
          dueAt: next.dueAt.toISOString(),
          lapses: newLapses,
        };
      }

      const goalDone = goalStatus({
        plantedToday: await countLearnCompleteToday(tx, userId),
        goal: await profileGoal(tx, userId),
      }).done;

      return {
        correct,
        grade,
        xpAwarded: stepXp.xpAwarded + (learnComplete?.xpAwarded ?? 0),
        xpCapped: stepXp.xpCapped || (learnComplete?.xpCapped ?? false),
        totalXp: learnComplete?.totalXp ?? stepXp.totalXp,
        streak: learnComplete?.streak ?? stepXp.streak,
        goalDone,
      };
    });
    return { ok: true, result };
  } catch (error) {
    if (error instanceof WordNotFoundError) {
      return { ok: false, error: "wordNotFound" };
    }
    if (pgErrorCode(error) === "23503") {
      return { ok: false, error: "wordNotFound" };
    }
    throw error;
  }
}

async function profileGoal(exec: Exec, userId: string): Promise<number> {
  const [row] = await exec
    .select({ dailyGoalWords: profiles.dailyGoalWords })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return row?.dailyGoalWords ?? 0;
}

/** Sentinel nội bộ — noProfile/wordNotFound đều về 404 wordNotFound (taxonomy). */
class WordNotFoundError extends Error {}
