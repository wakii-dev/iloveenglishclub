import { describe, expect, it } from "vitest";
import { buildDailyPlan, EMPTY_DAILY_PLAN } from "./daily-plan";

/**
 * Kế hoạch ngày + streak (story vocabulary-learn t-1.5) — PURE, derive từ
 * user_word_progress (không bảng mới): X từ mới từ queue (reps 0 đến hạn) +
 * Y ôn due (reps > 0 đến hạn) + hàng chờ những ngày tới + thành thạo +
 * streak VN (vnToday/computeStreak gamification — TZ Asia/Ho_Chi_Minh).
 * Test tất định: NOW = 03:00Z = 10:00 sáng VN.
 */
const NOW = new Date("2026-10-04T03:00:00.000Z"); // 10:00 VN 04/10
const H = 3_600_000;

type Row = {
  reps: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
};

function row(partial: Partial<Row>): Row {
  return { reps: 0, dueAt: new Date(NOW.getTime() - H), lastReviewedAt: null, ...partial };
}

describe("buildDailyPlan", () => {
  it("rows rỗng → EMPTY_DAILY_PLAN (mọi số 0, streak 0)", () => {
    expect(buildDailyPlan([], NOW)).toEqual(EMPTY_DAILY_PLAN);
    expect(EMPTY_DAILY_PLAN).toEqual({
      newDue: 0,
      reviewDue: 0,
      totalDue: 0,
      upcoming: 0,
      total: 0,
      mastered: 0,
      streakDays: 0,
    });
  });

  it("X từ mới (reps 0, đến hạn) + Y ôn due (reps > 0) tách riêng", () => {
    const plan = buildDailyPlan(
      [
        row({ reps: 0 }), // mới due
        row({ reps: 0, dueAt: new Date(NOW.getTime() - 26 * H) }), // mới due trễ
        row({ reps: 2 }), // ôn due
        row({ reps: 1, dueAt: new Date(NOW.getTime() - 5 * H) }), // ôn due
      ],
      NOW,
    );
    expect(plan.newDue).toBe(2);
    expect(plan.reviewDue).toBe(2);
    expect(plan.totalDue).toBe(4);
  });

  it("hàng chưa đến hạn (queue những ngày tới) → upcoming, không lẫn totalDue", () => {
    const plan = buildDailyPlan(
      [
        row({ reps: 0 }),
        row({ reps: 0, dueAt: new Date(NOW.getTime() + 24 * H) }),
        row({ reps: 0, dueAt: new Date(NOW.getTime() + 48 * H) }),
        row({ reps: 2, dueAt: new Date(NOW.getTime() + 24 * H) }),
      ],
      NOW,
    );
    expect(plan.newDue).toBe(1);
    expect(plan.reviewDue).toBe(0);
    expect(plan.totalDue).toBe(1);
    expect(plan.upcoming).toBe(3);
    expect(plan.total).toBe(4);
  });

  it("mastered đếm theo reps ≥ 3 bất kể đến hạn", () => {
    const plan = buildDailyPlan(
      [
        row({ reps: 3, dueAt: new Date(NOW.getTime() + 24 * H) }),
        row({ reps: 5, dueAt: new Date(NOW.getTime() + 72 * H) }),
        row({ reps: 2 }),
      ],
      NOW,
    );
    expect(plan.mastered).toBe(2);
    expect(plan.total).toBe(3);
  });

  it("streak = 2: có review hôm nay + hôm qua (VN)", () => {
    const plan = buildDailyPlan(
      [
        row({
          reps: 1,
          dueAt: new Date(NOW.getTime() + 24 * H),
          lastReviewedAt: new Date("2026-10-04T02:00:00.000Z"), // 09:00 VN hôm nay
        }),
        row({
          reps: 1,
          dueAt: new Date(NOW.getTime() + 24 * H),
          lastReviewedAt: new Date("2026-10-03T10:00:00.000Z"), // 17:00 VN hôm qua
        }),
      ],
      NOW,
    );
    expect(plan.streakDays).toBe(2);
  });

  it("streak = 1 khi chỉ học hôm qua (chuỗi còn sống, chưa học hôm nay)", () => {
    const plan = buildDailyPlan(
      [
        row({
          reps: 1,
          dueAt: new Date(NOW.getTime() + 24 * H),
          lastReviewedAt: new Date("2026-10-03T10:00:00.000Z"),
        }),
      ],
      NOW,
    );
    expect(plan.streakDays).toBe(1);
  });

  it("streak = 0 khi review cách đúng 2 ngày (hôm qua trống — đứt chuỗi)", () => {
    const plan = buildDailyPlan(
      [
        row({
          reps: 1,
          dueAt: new Date(NOW.getTime() + 24 * H),
          lastReviewedAt: new Date("2026-10-02T10:00:00.000Z"),
        }),
      ],
      NOW,
    );
    expect(plan.streakDays).toBe(0);
  });

  it("lastReviewedAt null (mới seed chưa ôn) → không đóng góp streak", () => {
    const plan = buildDailyPlan([row({ reps: 0 })], NOW);
    expect(plan.streakDays).toBe(0);
  });
});
