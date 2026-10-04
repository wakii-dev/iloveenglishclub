import { describe, expect, it } from "vitest";
import { STUDY_WORDS_PER_DAY, planStaggerDueDates } from "./study-plan";

/**
 * Lịch trải từ mới (story vocabulary-learn t-1.2) — PURE: word thứ i được học
 * vào ngày floor(i / perDay) kể từ mốc bắt đầu; 5 từ/ngày mặc định (nhịp
 * "Bắt đầu học sách này"). Test tất định qua `now` truyền vào.
 */
const DAY_MS = 86_400_000;
const NOW = new Date("2026-10-04T03:00:00.000Z");

describe("planStaggerDueDates", () => {
  it("0 từ → lịch rỗng", () => {
    expect(planStaggerDueDates(0, { now: NOW })).toEqual([]);
  });

  it("5 từ, nhịp 5/ngày → tất cả đến hạn NGAY (ngày 0)", () => {
    const plan = planStaggerDueDates(5, { now: NOW });
    expect(plan).toHaveLength(5);
    for (const due of plan) expect(due.getTime()).toBe(NOW.getTime());
  });

  it("7 từ, nhịp 5/ngày → 5 từ ngày 0 + 2 từ ngày 1", () => {
    const plan = planStaggerDueDates(7, { now: NOW });
    expect(plan).toHaveLength(7);
    expect(plan.slice(0, 5).map((d) => d.getTime())).toEqual(
      Array(5).fill(NOW.getTime()),
    );
    expect(plan[5]!.getTime()).toBe(NOW.getTime() + DAY_MS);
    expect(plan[6]!.getTime()).toBe(NOW.getTime() + DAY_MS);
  });

  it("12 từ → 3 nhóm 5/5/2 ứng ngày 0/1/2", () => {
    const plan = planStaggerDueDates(12, { now: NOW });
    expect(plan[4]!.getTime()).toBe(NOW.getTime());
    expect(plan[5]!.getTime()).toBe(NOW.getTime() + DAY_MS);
    expect(plan[9]!.getTime()).toBe(NOW.getTime() + DAY_MS);
    expect(plan[10]!.getTime()).toBe(NOW.getTime() + 2 * DAY_MS);
    expect(plan[11]!.getTime()).toBe(NOW.getTime() + 2 * DAY_MS);
  });

  it("nhịp tùy chỉnh perDay 3 — 4 từ → 3 ngày 0 + 1 ngày 1", () => {
    const plan = planStaggerDueDates(4, { perDay: 3, now: NOW });
    expect(plan[2]!.getTime()).toBe(NOW.getTime());
    expect(plan[3]!.getTime()).toBe(NOW.getTime() + DAY_MS);
  });

  it("nhịp mặc định là 5 từ/ngày (STUDY_WORDS_PER_DAY)", () => {
    expect(STUDY_WORDS_PER_DAY).toBe(5);
    const plan = planStaggerDueDates(6, { now: NOW });
    expect(plan[5]!.getTime()).toBe(NOW.getTime() + DAY_MS);
  });

  it("count âm/lẻ → kẹp về 0 (không crash, không ngày âm)", () => {
    expect(planStaggerDueDates(-3, { now: NOW })).toEqual([]);
  });
});
