import { describe, expect, it } from "vitest";
import { addDays, computeStreak, vnToday } from "./streak";

/**
 * Streak logic SF-6 (context pack #2 — CHỐT CỨNG):
 * TZ CỐ ĐỊNH Asia/Ho_Chi_Minh; unit test 3 case bắt buộc:
 * hôm qua → +1 · hôm nay → giữ · khác → reset 1.
 * Source of truth daily_activity — computeStreak derive từ dates.
 */
describe("vnToday — ngày theo TZ Asia/Ho_Chi_Minh (UTC+7, không DST)", () => {
  it("17:00 UTC (00:00 VN) đã sang ngày kế", () => {
    // 2026-09-29T17:00:00Z = 2026-09-30 00:00 +07
    expect(vnToday(new Date("2026-09-29T17:00:00Z"))).toBe("2026-09-30");
  });

  it("16:59:59 UTC vẫn ngày cũ (23:59:59 VN)", () => {
    expect(vnToday(new Date("2026-09-29T16:59:59Z"))).toBe("2026-09-29");
  });

  it("giữa ngày VN", () => {
    // 2026-09-29T03:30:00Z = 10:30 VN
    expect(vnToday(new Date("2026-09-29T03:30:00Z"))).toBe("2026-09-29");
  });
});

describe("addDays — lùi/tiến ngày trên chuỗi YYYY-MM-DD", () => {
  it("lùi 1 ngày qua ranh giới tháng", () => {
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("tiến 1 ngày", () => {
    expect(addDays("2026-09-29", 1)).toBe("2026-09-30");
  });

  it("zero-pad đúng", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("computeStreak — 3 case bắt buộc (context pack #2)", () => {
  const today = "2026-09-29";
  const yesterday = "2026-09-28";

  it("hôm qua → +1: last active hôm qua, hôm nay vừa học → streak tăng", () => {
    // cached trước đó: chuỗi 4 kết thúc hôm qua; thêm hôm nay → 5
    const dates = ["2026-09-25", "2026-09-26", "2026-09-27", yesterday, today];
    expect(computeStreak(dates, today)).toBe(5);
  });

  it("hôm nay → giữ: recompute lần 2 trong cùng ngày cho cùng giá trị", () => {
    const dates = ["2026-09-26", "2026-09-27", yesterday, today];
    const once = computeStreak(dates, today);
    const twice = computeStreak(dates, today); // submit thứ 2 cùng ngày
    expect(once).toBe(4);
    expect(twice).toBe(once);
  });

  it("khác → reset 1: lần hoạt động cuối cách hôm nay >1 ngày", () => {
    // txn upsert today TRƯỚC khi recompute — dates luôn chứa today
    const dates = ["2026-09-20", "2026-09-21", "2026-09-25", today];
    expect(computeStreak(dates, today)).toBe(1);
  });
});

describe("computeStreak — nhánh biên", () => {
  const today = "2026-09-29";

  it("chuỗi dài liên tục", () => {
    const dates = Array.from({ length: 10 }, (_, i) =>
      addDays(today, -(9 - i)),
    );
    expect(computeStreak(dates, today)).toBe(10);
  });

  it("hôm nay chưa học → chuỗi còn sống tính từ hôm qua (display)", () => {
    const dates = ["2026-09-27", "2026-09-28"]; // hôm qua là 28
    expect(computeStreak(dates, today)).toBe(2);
  });

  it("rỗng → 0", () => {
    expect(computeStreak([], today)).toBe(0);
  });

  it("chỉ ngày tương lai (dữ liệu lệch) → 0", () => {
    expect(computeStreak(["2026-09-30"], today)).toBe(0);
  });

  it("duplicate dates (upsert race) không đếm kép", () => {
    expect(computeStreak([today, today, "2026-09-28"], today)).toBe(2);
  });
});

/**
 * Frozen set — daily-journey SF-1 (VU-49, epic spec §2.3 CHỐT CỨNG):
 * frozen chứa date ⇒ ngày đó được coi như có hoạt động khi walk-back.
 * IDENTITY TEST là backward-compat gate: frozen rỗng ≡ byte-identical hành
 * vi cũ — streak người dùng hiện có KHÔNG đổi khi merge SF-1.
 */
describe("computeStreak — frozen set (SF-1 VU-49)", () => {
  const today = "2026-09-29";

  it("IDENTITY: frozen rỗng ≡ legacy trên mọi fixture (backward-compat gate)", () => {
    const fixtures: Array<[string[], string]> = [
      [["2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", today], today],
      [[today], today],
      [["2026-09-27", "2026-09-28"], today], // hôm nay chưa học
      [[], today],
      [["2026-09-20", today], today], // reset case
      [["2026-09-30"], today], // chỉ tương lai
      [[today, today, "2026-09-28"], today], // duplicate
    ];
    for (const [dates, day] of fixtures) {
      expect(computeStreak(dates, day, new Set())).toBe(
        computeStreak(dates, day),
      );
    }
  });

  it("freeze bridge 1-gap: gap hôm qua được freeze → chuỗi liền", () => {
    const dates = ["2026-09-26", "2026-09-27", today]; // 2026-09-28 gap
    expect(computeStreak(dates, today)).toBe(1); // không freeze → đứt
    expect(computeStreak(dates, today, new Set(["2026-09-28"]))).toBe(4);
  });

  it("multi-freeze: nhiều gap riêng biệt đều được bắc cầu", () => {
    const dates = ["2026-09-23", "2026-09-25", "2026-09-27", today];
    const frozen = new Set(["2026-09-24", "2026-09-26", "2026-09-28"]);
    expect(computeStreak(dates, today, frozen)).toBe(7);
  });

  it("freeze-hôm-nay là no-op khi hôm nay đã active (write-path luôn upsert today trước recompute)", () => {
    const dates = ["2026-09-27", "2026-09-28", today];
    expect(computeStreak(dates, today, new Set([today]))).toBe(3);
  });

  it("gap KHÔNG nằm trong frozen vẫn đứt như cũ", () => {
    const dates = ["2026-09-26", "2026-09-27", today];
    // freeze nhầm ngày 25 (đã active) — gap 28 không freeze → chỉ today
    expect(computeStreak(dates, today, new Set(["2026-09-25"]))).toBe(1);
  });

  it("pin edge: frozen chứa today + today CHƯA có trong dates → today được coi active (literal spec §2.3 'coi như có hoạt động')", () => {
    // Không thể đạt qua planFreezes (walk từ hôm qua, không bao giờ freeze
    // today) — pin hành vi để caller không lợn vào nhánh này vô thức
    expect(computeStreak(["2026-09-27", "2026-09-28"], today, new Set([today]))).toBe(3);
    expect(computeStreak([], today, new Set([today]))).toBe(1);
  });
});
