import { describe, expect, it } from "vitest";
import { planFreezes } from "./shield-planner";

/**
 * Shield-planner thuần — daily-journey SF-1 (VU-49, epic spec §2.3): duyệt
 * lùi từ HÔM QUA trong window `lookback` ngày (calendar — chỉ xét
 * hôm-qua..hôm-trước-lookback), gap + credits > 0 → freeze; hết credit /
 * đạt cap → DỪNG. Window bounded = write-path O(lookback), không quét lịch
 * sử. KHÔNG DB — SF-4 recomputeStreakTx là caller duy nhất tạo freeze rows;
 * planner chỉ tính kế hoạch. (Semantics lookback chọn calendar-window — spec
 * prose "7 ngày gap" mơ hồ, REQUIREMENT-GAP epic VU-48; case §4.5 cho kết
 * quả giống mọi reading.)
 */
describe("planFreezes — duyệt lùi từ hôm qua trong window lookback", () => {
  const today = "2026-09-29";

  it("history đầy đủ cả window (22..28) → không freeze, credits nguyên", () => {
    const fullWeek = ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"];
    const plan = planFreezes([...fullWeek, today], today, 2);
    expect(plan).toEqual({ freezeDates: [], creditsLeft: 2 });
  });

  it("window bounded: hố sâu ngoài lookback (≥8 ngày) KHÔNG bị freeze dù credits còn", () => {
    // cả window 28..22 active, hố ở 20 — không quét sâu hơn window
    const windowDays = ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"];
    const plan = planFreezes([...windowDays, "2026-09-20", today], today, 2);
    expect(plan).toEqual({ freezeDates: [], creditsLeft: 2 });
  });

  it("1 gap hôm qua → freeze đúng ngày đó, credits −1", () => {
    const plan = planFreezes([today], today, 1);
    expect(plan).toEqual({ freezeDates: ["2026-09-28"], creditsLeft: 0 });
  });

  it("consume order: gap GẦN nhất được freeze trước, hết credit dừng (gap xa không đụng)", () => {
    // gaps: 28, 27 (gần) — rồi 25, 23 (xa). 1 credit chỉ đủ ngày 28.
    const plan = planFreezes([today, "2026-09-25", "2026-09-23"], today, 1);
    expect(plan).toEqual({ freezeDates: ["2026-09-28"], creditsLeft: 0 });
  });

  it("hoạt động xen giữa: đi QUA ngày active, freeze cả 2 gap", () => {
    // active 29, 27, 25 — gaps 28, 26; sau 24 gap tiếp nhưng hết credit
    const plan = planFreezes([today, "2026-09-27", "2026-09-25"], today, 2);
    expect(plan).toEqual({
      freezeDates: ["2026-09-28", "2026-09-26"],
      creditsLeft: 0,
    });
  });

  it("cap: tối đa `cap` freeze một lần gọi — credits dư vẫn dừng ở cap", () => {
    // 9 ngày gap liên tục (28..20), credits 5, cap 2 → chỉ 2 freeze
    const plan = planFreezes([today], today, 5, 2);
    expect(plan.freezeDates).toEqual(["2026-09-28", "2026-09-27"]);
    expect(plan.creditsLeft).toBe(3);
  });

  it("lookback 7: gap-run vượt 7 ngày gap liên tiếp → dừng dù credits còn", () => {
    // 9 ngày gap (28..20), credits 99, cap 99 → freeze đúng 7 ngày gap
    const plan = planFreezes([today], today, 99, 99);
    expect(plan.freezeDates).toEqual([
      "2026-09-28",
      "2026-09-27",
      "2026-09-26",
      "2026-09-25",
      "2026-09-24",
      "2026-09-23",
      "2026-09-22",
    ]);
    expect(plan.creditsLeft).toBe(92);
  });

  it("lookback biên: đúng 7 ngày gap → hết 7 ngày đó, không vượt", () => {
    const plan7 = planFreezes([today], today, 99, 99);
    expect(plan7.freezeDates).toHaveLength(7);
  });

  it("credits 0 → không freeze gì", () => {
    expect(planFreezes([today], today, 0)).toEqual({
      freezeDates: [],
      creditsLeft: 0,
    });
  });

  it("micro-edge: cap=0 hoặc lookback=0 → không freeze (không loop trái phép)", () => {
    expect(planFreezes([today], today, 5, 0)).toEqual({
      freezeDates: [],
      creditsLeft: 5,
    });
    expect(planFreezes([today], today, 5, 2, 0)).toEqual({
      freezeDates: [],
      creditsLeft: 5,
    });
  });

  it("hôm nay KHÔNG bao giờ bị freeze (walk bắt đầu từ hôm qua)", () => {
    const plan = planFreezes([], today, 5);
    expect(plan.freezeDates).not.toContain(today);
    expect(plan.freezeDates).toEqual(["2026-09-28", "2026-09-27"]);
  });
});
