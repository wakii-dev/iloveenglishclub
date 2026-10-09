/**
 * Dashboard aggregate store (vocab-memrise SF-4, VU-41 — context pack sf-4.md
 * mục 2/3/5/6/7). Data cá nhân tab Tổng quan dạng dashboard: query live, không
 * cache (cùng pattern hub-store); DB lỗi → fallback 0/rỗng build-safe.
 *
 * Sở hữu SF-4:
 *  - plantedToday = count `vocab_activity` kind='learn-complete' NGÀY VN
 *    (day boundary qua vnToday/ILEC_TZ — tái dùng src/lib/gamification/streak.ts)
 *  - streak/activeToday derive từ `daily_activity` (source of truth) qua
 *    computeStreak — vocab HOẶC dictation đều giữ presence row
 *  - garden distribution: COUNT SQL-side theo boundary `growth.ts` (SF-1) —
 *    bounds copy ở GARDEN_BOUNDS, drift-guard qua gardenStageBucket sweep
 *    (dashboard-store.test.ts đối chiếu growthStage) vì lib SF-1 chỉ import
 *  - continue target + per-book level progress: MỘT query JOIN
 *    book_words⋈books⋈user_word_progress rồi pure levels.ts (nextLevel/
 *    levelProgress) — KHÔNG derive riêng
 */
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  bookWords,
  books,
  dailyActivity,
  lessons,
  profiles,
  units,
  userLessonProgress,
  userWordProgress,
  vocabActivity,
} from "@/db/schema";
import { computeStreak, vnToday } from "@/lib/gamification/streak";
import {
  type LevelChunk,
  type LevelProgress,
  type WordLevelRow,
  levelProgress,
  nextLevel,
} from "./levels";
import { getHubStats } from "./hub-store";

const STREAK_LOOKBACK_DAYS = 400; // như vocab-xp-store — cap hợp lý v1
const DEFAULT_GOAL = 5; // profiles.daily_goal_words default migration 0005

export type DashboardSummary = {
  /** Từ mới planted hôm nay (learn-complete, ngày VN). */
  plantedToday: number;
  dailyGoalWords: number;
  /** profiles.xp — cache write-through (dictation + vocab). */
  totalXp: number;
  /** Chuỗi liên tiếp hiện tại (presence daily_activity). */
  streak: number;
  /** Đã có hoạt động hôm nay (độ tươi của ring/streak). */
  activeToday: boolean;
  /** Từ đến hạn ôn — tái dùng getHubStats (context pack mục 5). */
  dueToday: number;
};

export async function getDashboardSummary(
  userId: string,
  now: Date,
): Promise<DashboardSummary> {
  const fallback: DashboardSummary = {
    plantedToday: 0,
    dailyGoalWords: DEFAULT_GOAL,
    totalXp: 0,
    streak: 0,
    activeToday: false,
    dueToday: 0,
  };
  try {
    const today = vnToday(now);

    // planted-today: learn-complete trong ngày VN (pattern count-filter
    // vocab-xp-store — cùng cast `at time zone`)
    const [plantedRow] = await db
      .select({
        planted:
          sql<number>`count(*) filter (where ${vocabActivity.kind} = 'learn-complete' and (${vocabActivity.createdAt} at time zone 'Asia/Ho_Chi_Minh')::date = ${today}::date)`.mapWith(
            Number,
          ),
      })
      .from(vocabActivity)
      .where(eq(vocabActivity.userId, userId));

    const [profile] = await db
      .select({
        dailyGoalWords: profiles.dailyGoalWords,
        xp: profiles.xp,
      })
      .from(profiles)
      .where(eq(profiles.id, userId));

    const activityDates = await db
      .select({ date: dailyActivity.date })
      .from(dailyActivity)
      .where(eq(dailyActivity.userId, userId))
      .orderBy(desc(dailyActivity.date))
      .limit(STREAK_LOOKBACK_DAYS);
    const dates = activityDates.map((r) => r.date);
    const stats = await getHubStats(userId);

    return {
      plantedToday: plantedRow?.planted ?? 0,
      dailyGoalWords: profile?.dailyGoalWords ?? DEFAULT_GOAL,
      totalXp: profile?.xp ?? 0,
      streak: computeStreak(dates, today),
      activeToday: dates.includes(today),
      dueToday: stats.dueToday,
    };
  } catch (error) {
    console.error("[vocabulary:dashboardSummary] query failed:", error);
    return fallback;
  }
}

/*
 * Boundary stage 0..7 của growth.ts (SF-1, epic spec §2.4) — growth.test.ts
 * đã pin lib; bounds TÁI SAOCH Ở ĐÂY chỉ để build SQL filter (lib thuần không
 * export, boundary cứng theo spec). gardenStageBucket + test sweep đối chiếu
 * growthStage() là drift-guard: lib đổi bounds → test đỏ tại chỗ này.
 */
const GARDEN_BOUNDS = [2, 7, 14, 45, 100, 200] as const;

/** Bucket 0..7 của 1 từ — else-chain y growthStage từ GARDEN_BOUNDS. */
export function gardenStageBucket({
  reps,
  intervalDays,
}: {
  reps: number;
  intervalDays: number;
}): number {
  if (reps <= 0) return 0;
  const days = Math.max(0, intervalDays);
  for (let stage = 0; stage < GARDEN_BOUNDS.length; stage++) {
    if (days < GARDEN_BOUNDS[stage]) return stage + 1;
  }
  return 7;
}

/**
 * Nửa khoảng [lower, upper) của stage 1..7 theo growthStage (spec §2.4 —
 * ngưỡng TRÊN loại): s1 = <2 · s2 = [2,7) · … · s6 = [100,200) · s7 = ≥200.
 * Nguồn bounds MỘT chỗ cho SQL — stageBoundFilter sweep (test) đối chiếu
 * growthStage chống drift.
 */
export function stageBoundFilter(stage: number): {
  lower: number | null;
  upper: number | null;
} {
  if (stage === 1) return { lower: null, upper: GARDEN_BOUNDS[0] };
  if (stage === GARDEN_BOUNDS.length + 1) {
    return {
      lower: GARDEN_BOUNDS[GARDEN_BOUNDS.length - 1],
      upper: null,
    };
  }
  return {
    lower: GARDEN_BOUNDS[stage - 2],
    upper: GARDEN_BOUNDS[stage - 1],
  };
}

function stageCountSql(stage: number): SQL<number> {
  const reps = userWordProgress.reps;
  const interval = userWordProgress.intervalDays;
  if (stage === 0) {
    return sql<number>`count(*) filter (where ${reps} = 0)`.mapWith(Number);
  }
  const { lower, upper } = stageBoundFilter(stage);
  const upperClause =
    upper === null
      ? sql``
      : sql` and ${interval} < ${upper}`;
  return sql<number>`count(*) filter (where ${reps} > 0 and ${interval} >= ${lower ?? 0}${upperClause})`.mapWith(
    Number,
  );
}

/** Phân bố 8 stage — 1 query COUNT filter, không load-all (context pack #6). */
export async function getGardenDistribution(
  userId: string,
): Promise<number[]> {
  try {
    const [row] = await db
      .select({
        s0: stageCountSql(0),
        s1: stageCountSql(1),
        s2: stageCountSql(2),
        s3: stageCountSql(3),
        s4: stageCountSql(4),
        s5: stageCountSql(5),
        s6: stageCountSql(6),
        s7: stageCountSql(7),
      })
      .from(userWordProgress)
      .where(eq(userWordProgress.userId, userId));
    return [
      row?.s0 ?? 0,
      row?.s1 ?? 0,
      row?.s2 ?? 0,
      row?.s3 ?? 0,
      row?.s4 ?? 0,
      row?.s5 ?? 0,
      row?.s6 ?? 0,
      row?.s7 ?? 0,
    ];
  } catch (error) {
    console.error("[vocabulary:gardenDistribution] query failed:", error);
    return Array.from({ length: 8 }, () => 0);
  }
}

export type BookRow = {
  bookId: number;
  slug: string;
  titleEn: string;
  titleVi: string | null;
  /** Chip CEFR trên progress bars (hand-off §2.1 khối 5). */
  cefrLabel: string;
  order: number;
  /** null = chưa có row progress (chưa bắt đầu). */
  reps: number | null;
};

/** 1 query MỌI book: (book, order, reps) — input cho continue + levels. */
async function loadBookRows(userId: string): Promise<BookRow[]> {
  const rows = await db
    .select({
      bookId: bookWords.bookId,
      slug: books.slug,
      titleEn: books.titleEn,
      titleVi: books.titleVi,
      cefrLabel: books.cefrLabel,
      order: bookWords.order,
      reps: userWordProgress.reps,
    })
    .from(bookWords)
    .innerJoin(books, eq(bookWords.bookId, books.id))
    .leftJoin(
      userWordProgress,
      and(
        eq(userWordProgress.wordId, bookWords.wordId),
        eq(userWordProgress.userId, userId),
      ),
    )
    .orderBy(asc(books.sortOrder), asc(bookWords.order));
  return rows;
}

/** Nhóm rows theo book giữ thứ tự sortOrder (output query đã sort). */
function groupByBook(rows: BookRow[]): {
  book: Omit<BookRow, "order" | "reps">;
  wordRows: WordLevelRow[];
}[] {
  const grouped: {
    book: Omit<BookRow, "order" | "reps">;
    wordRows: WordLevelRow[];
  }[] = [];
  for (const row of rows) {
    let entry = grouped.find((g) => g.book.bookId === row.bookId);
    if (!entry) {
      entry = {
        book: {
          bookId: row.bookId,
          slug: row.slug,
          titleEn: row.titleEn,
          titleVi: row.titleVi,
          cefrLabel: row.cefrLabel,
        },
        wordRows: [],
      };
      grouped.push(entry);
    }
    entry.wordRows.push({
      // wordId giả (index nhóm) — levels.ts chỉ dùng order/reps; nếu sau này
      // lib thêm logic theo wordId phải thay bằng wordId thật từ query
      wordId: entry.wordRows.length,
      order: row.order,
      reps: row.reps ?? 0,
    });
  }
  return grouped;
}

export type BookLevelProgress = {
  bookId: number;
  slug: string;
  titleEn: string;
  titleVi: string | null;
  cefrLabel: string;
  progress: LevelProgress;
};

/** Per-book level progress bars — levelProgress() levels.ts per book (#7). */
export async function getBookLevelProgresses(
  userId: string,
): Promise<BookLevelProgress[]> {
  try {
    return groupByBook(await loadBookRows(userId)).map(({ book, wordRows }) => ({
      ...book,
      progress: levelProgress(wordRows),
    }));
  } catch (error) {
    console.error("[vocabulary:bookLevelProgresses] query failed:", error);
    return [];
  }
}

/**
 * Lưu goal (context pack mục 4/8) — route /api/vocabulary/goal gọi sau khi
 * validate integer 1..100 (route sở hữu taxonomy 401/400). { ok:false } khi
 * DB lỗi (route map 500 generic).
 */
export async function updateDailyGoal(
  userId: string,
  goal: number,
): Promise<{ ok: boolean; dailyGoalWords?: number }> {
  try {
    const [row] = await db
      .update(profiles)
      .set({ dailyGoalWords: goal })
      .where(eq(profiles.id, userId))
      .returning({ dailyGoalWords: profiles.dailyGoalWords });
    if (!row) {
      console.error("[vocabulary:updateDailyGoal] profile missing:", userId);
      return { ok: false };
    }
    return { ok: true, dailyGoalWords: row.dailyGoalWords };
  } catch (error) {
    console.error("[vocabulary:updateDailyGoal] update failed:", error);
    return { ok: false };
  }
}

export type ContinueCard =
  | {
      completed: false;
      bookId: number;
      slug: string;
      titleEn: string;
      titleVi: string | null;
      cefrLabel: string;
      /** Level kế tiếp — chunk đầu theo order còn ≥1 từ reps=0. */
      level: LevelChunk;
      /** Số từ mới còn lại trong level (CTA "Học k từ mới"). */
      newCount: number;
    }
  /** MỌI sách planted hết — vẫn giữ meta sách cuối (hand-off: tag đổi, tên
   * sách vẫn hiện; CTA disabled không link). */
  | {
      completed: true;
      bookId: number;
      slug: string;
      titleEn: string;
      titleVi: string | null;
      cefrLabel: string;
    };

/**
 * Continue card — tagged union: còn sách học được → book + level kế tiếp
 * (nextLevel() levels.ts, KHÔNG tự derive); MỌI sách planted hết → completed
 * với meta sách cuối (CTA disabled, không link level rỗng — acceptance #4).
 * DB lỗi → null (component render empty). Ưu tiên sách đang đọc
 * (user_lesson_progress — pattern listDiscoverBooks), fallback sách đầu còn
 * từ chưa planted theo sortOrder.
 */
export async function getContinueTarget(
  userId: string,
): Promise<ContinueCard | null> {
  try {
    const reading = await db
      .selectDistinct({ bookId: units.bookId })
      .from(userLessonProgress)
      .innerJoin(lessons, eq(lessons.id, userLessonProgress.lessonId))
      .innerJoin(units, eq(units.id, lessons.unitId))
      .where(eq(userLessonProgress.userId, userId));
    const readingIds = new Set(reading.map((r) => r.bookId));

    const grouped = groupByBook(await loadBookRows(userId));
    const pick = (bookIds: Set<number> | null): ContinueCard | null => {
      for (const { book, wordRows } of grouped) {
        if (bookIds && !bookIds.has(book.bookId)) continue;
        const level = nextLevel(wordRows);
        if (level === null) continue;
        return {
          completed: false,
          ...book,
          level,
          newCount: level.words.filter((w) => w.reps === 0).length,
        };
      }
      return null;
    };
    // đang đọc trước, fallback mọi sách (context pack #2 + plan quyết định)
    return (
      pick(readingIds) ??
      pick(null) ??
      (grouped.length > 0
        ? {
            completed: true,
            ...grouped[grouped.length - 1]!.book,
          }
        : null)
    );
  } catch (error) {
    console.error("[vocabulary:continueTarget] query failed:", error);
    return null;
  }
}
