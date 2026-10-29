import { describe, expect, it } from "vitest";
import { shieldCoveringGap } from "./today-streak";
import { addDays } from "@/lib/gamification/streak";

/**
 * shieldCoveringGap (SF-4 review P1-1, VU-52): freeze "đang covering gap
 * gần nhất" ⟺ freeze GẦN NHẤT nằm trong window chuỗi hiển thị
 * [cursor−(streak−1) .. cursor]; cursor = today khi activeToday, else
 * yesterday. Stale freeze sâu hơn chuỗi ⇒ null (card hiện shield trung
 * tính — KHÔNG tuyên bố "chuỗi không đứt" khi gap mới chưa cover).
 */
const TODAY = "2026-10-15";
const d = (n: number) => addDays(TODAY, -n);

describe("shieldCoveringGap — review P1-1 divergence case", () => {
  it("freeze trong chuỗi (hôm qua, active hôm nay, streak 3) → covered", () => {
    expect(shieldCoveringGap([d(1)], 3, true, TODAY)).toBe(d(1));
  });

  it("stale freeze sâu hơn chuỗi → null (divergence: gap mới KHÔNG cover)", () => {
    // freeze d-5 còn row, chuỗi chỉ 1 ngày (gap mới hôm-qua KHÔNG cover —
    // hết credit) → KHÔNG được tuyên bố "đang bảo vệ"
    expect(shieldCoveringGap([d(5)], 1, true, TODAY)).toBeNull();
  });

  it("freeze ngay head chuỗi khi chưa học hôm nay (cursor = yesterday) → covered", () => {
    // freeze hôm-qua giữ chuỗi sống: activeToday false, streak 2
    expect(shieldCoveringGap([d(1)], 2, false, TODAY)).toBe(d(1));
  });

  it("nhiều freeze — freeze GẦN NHẤT quyết định (cũ trong window nhưng mới ngoài → null)", () => {
    expect(shieldCoveringGap([d(6), d(1)], 3, true, TODAY)).toBe(d(1));
    expect(shieldCoveringGap([d(1), d(6)], 3, true, TODAY)).toBe(d(1));
    // gần nhất d-6 ngoài window chuỗi 3 ngày ⇒ null dù có freeze khác cũng ngoài
    expect(shieldCoveringGap([d(6), d(7)], 3, true, TODAY)).toBeNull();
  });

  it("streak 0 hoặc không freeze → null", () => {
    expect(shieldCoveringGap([d(1)], 0, true, TODAY)).toBeNull();
    expect(shieldCoveringGap([], 3, true, TODAY)).toBeNull();
  });

  it("freeze TRONG window chuỗi dài — vẫn covered (đang là mắt xích)", () => {
    expect(shieldCoveringGap([d(5)], 10, true, TODAY)).toBe(d(5));
  });
});
