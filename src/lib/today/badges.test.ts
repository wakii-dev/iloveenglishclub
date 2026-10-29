import { describe, expect, it } from "vitest";
import { BADGE_POOL, evalBadges, type BadgeStats } from "./badges";

/**
 * Badge pool + eval thuần — daily-journey SF-1 (VU-49, epic spec §2.5):
 * pool milestone theo enumeration (streak-3/7/30/100 · active-days-10/50/200
 * · words-learned-10/100/1000 · listen-60/600 · quests-5/25/100 = 15 id —
 * prose "13" là miscount, xem REQUIREMENT-GAP epic VU-48);
 * evalBadges(stats) → badgeId[] theo thứ tự pool. Lazy award + idempotency
 * là việc snapshot tx (SF-2) — đây chỉ là hàm đánh giá thuần.
 */
describe("BADGE_POOL — đúng enumeration spec §2.5", () => {
  // Spec §2.5 enumeration liệt kê tường minh 15 id (4 streak + 3 active-days
  // + 3 words-learned + 2 listen + 3 quests); prose gọi "pool 13" là miscount
  // (REQUIREMENT-GAP đã ghi epic VU-48). Enumeration = data — implement đủ 15.
  it("đủ 15 id theo enumeration, không trùng, đủ 5 nhóm", () => {
    const ids = BADGE_POOL.map((b) => b.badgeId);
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(15);
    expect(ids).toEqual([
      "streak-3",
      "streak-7",
      "streak-30",
      "streak-100",
      "active-days-10",
      "active-days-50",
      "active-days-200",
      "words-learned-10",
      "words-learned-100",
      "words-learned-1000",
      "listen-60",
      "listen-600",
      "quests-5",
      "quests-25",
      "quests-100",
    ]);
  });

  it("ngưỡng milestone đúng spec: streak 3/7/30/100 · days 10/50/200 · words 10/100/1000 · listen 60/600 · quests 5/25/100", () => {
    const byId = new Map(BADGE_POOL.map((b) => [b.badgeId, b.milestone]));
    expect(byId.get("streak-3")).toBe(3);
    expect(byId.get("streak-7")).toBe(7);
    expect(byId.get("streak-30")).toBe(30);
    expect(byId.get("streak-100")).toBe(100);
    expect(byId.get("active-days-10")).toBe(10);
    expect(byId.get("active-days-50")).toBe(50);
    expect(byId.get("active-days-200")).toBe(200);
    expect(byId.get("words-learned-10")).toBe(10);
    expect(byId.get("words-learned-100")).toBe(100);
    expect(byId.get("words-learned-1000")).toBe(1000);
    expect(byId.get("listen-60")).toBe(60);
    expect(byId.get("listen-600")).toBe(600);
    expect(byId.get("quests-5")).toBe(5);
    expect(byId.get("quests-25")).toBe(25);
    expect(byId.get("quests-100")).toBe(100);
  });

  it("metric map đúng nguồn snapshot: streak/activeDays/wordsLearned/listenMinutes/questsCompleted", () => {
    const byId = new Map(BADGE_POOL.map((b) => [b.badgeId, b.metric]));
    expect(byId.get("streak-3")).toBe("streak");
    expect(byId.get("active-days-10")).toBe("activeDays");
    expect(byId.get("words-learned-10")).toBe("wordsLearned");
    // listen-* đọc getMyStats listenMinutes ALL-TIME — KHÔNG phải tổng listen_ms
    expect(byId.get("listen-60")).toBe("listenMinutes");
    expect(byId.get("quests-5")).toBe("questsCompleted");
  });
});

describe("evalBadges — biên milestone", () => {
  const base: BadgeStats = {
    streak: 0,
    activeDays: 0,
    wordsLearned: 0,
    listenMinutes: 0,
    questsCompleted: 0,
  };

  it("stats 0 → rỗng", () => {
    expect(evalBadges(base)).toEqual([]);
  });

  it("ĐÚNG tại mốc tính earned (>=, không >)", () => {
    expect(
      evalBadges({ ...base, streak: 3, questsCompleted: 5 }),
    ).toEqual(["streak-3", "quests-5"]);
    expect(
      evalBadges({ ...base, streak: 2, questsCompleted: 4 }),
    ).toEqual([]);
  });

  it("nhiều nhóm cùng lúc → theo thứ tự pool", () => {
    const stats: BadgeStats = {
      streak: 8,
      activeDays: 12,
      wordsLearned: 15,
      listenMinutes: 61,
      questsCompleted: 6,
    };
    expect(evalBadges(stats)).toEqual([
      "streak-3",
      "streak-7",
      "active-days-10",
      "words-learned-10",
      "listen-60",
      "quests-5",
    ]);
  });

  it("mốc cao không tự cho mốc thấp — mốc 30 cần streak ≥ 30", () => {
    expect(evalBadges({ ...base, streak: 29 })).toEqual(["streak-3", "streak-7"]);
    expect(evalBadges({ ...base, streak: 100 })).toEqual([
      "streak-3",
      "streak-7",
      "streak-30",
      "streak-100",
    ]);
  });
});
