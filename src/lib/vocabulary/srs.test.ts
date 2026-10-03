import { describe, expect, it } from "vitest";
import {
  EASE_MAX,
  EASE_MIN,
  nextReview,
} from "./srs";

/**
 * SRS engine SM-2 lite (SF-3 t-3.1) — biên quality thấp/cao, lần đầu, chuỗi
 * dài, reset khi quên, clamp ease 1.3–2.8, dueAt đếm ngày tất định (now fixed).
 */
const NOW = new Date("2026-10-03T09:00:00.000Z");
const DAY = 86_400_000;

/** Ôn đều q=4 (ease giữ 2.5 khi q=4) — chuỗi interval chuẩn SM-2. */
function streak(quality: number, times: number) {
  let state = { ease: 2.5, intervalDays: 0, reps: 0 };
  const results = [];
  for (let i = 0; i < times; i++) {
    const next = nextReview({ ...state, quality }, NOW);
    results.push(next);
    state = { ease: next.ease, intervalDays: next.intervalDays, reps: next.reps };
  }
  return results;
}

describe("nextReview — lần đầu ôn (row mới)", () => {
  it("q=4 lần đầu: interval 1 ngày, reps 1, ease giữ 2.5 (EF' = +0 tại q=4)", () => {
    const next = nextReview(
      { ease: 2.5, intervalDays: 0, reps: 0, quality: 4 },
      NOW,
    );
    expect(next).toEqual({
      ease: 2.5,
      intervalDays: 1,
      dueAt: new Date(NOW.getTime() + DAY),
      reps: 1,
    });
  });

  it("q=5 lần đầu: ease tăng 2.5 → 2.6", () => {
    const next = nextReview(
      { ease: 2.5, intervalDays: 0, reps: 0, quality: 5 },
      NOW,
    );
    expect(next.ease).toBeCloseTo(2.6, 10);
    expect(next.intervalDays).toBe(1);
  });

  it("q=3 lần đầu (vừa đủ nhớ): ease giảm 2.5 → 2.36, vẫn pass interval 1", () => {
    const next = nextReview(
      { ease: 2.5, intervalDays: 0, reps: 0, quality: 3 },
      NOW,
    );
    expect(next.ease).toBeCloseTo(2.36, 10);
    expect(next.intervalDays).toBe(1);
    expect(next.reps).toBe(1);
  });

  it("không truyền state (row mới): mặc định ease 2.5 / interval 0 / reps 0", () => {
    const next = nextReview({ quality: 4 }, NOW);
    expect(next.intervalDays).toBe(1);
    expect(next.reps).toBe(1);
    expect(next.ease).toBe(2.5);
  });
});

describe("nextReview — pass liên tiếp (q>=3)", () => {
  it("rep 2: interval 6 ngày bất kể ease", () => {
    const next = nextReview(
      { ease: 2.5, intervalDays: 1, reps: 1, quality: 4 },
      NOW,
    );
    expect(next.intervalDays).toBe(6);
    expect(next.reps).toBe(2);
  });

  it("rep 3: interval = round(6 × ease) = 15 ngày (ease 2.5)", () => {
    const next = nextReview(
      { ease: 2.5, intervalDays: 6, reps: 2, quality: 4 },
      NOW,
    );
    expect(next.intervalDays).toBe(15);
    expect(next.reps).toBe(3);
  });

  it("chuỗi q=4 dài: 1 → 6 → 15 → 38 → 95 (nhân ease 2.5, làm tròn)", () => {
    const intervals = streak(4, 5).map((r) => r.intervalDays);
    expect(intervals).toEqual([1, 6, 15, 38, 95]);
  });

  it("q=3 liên tiếp: ease trượt 2.36 → 2.22 → 2.08, interval rep3 = round(6×2.08) = 12", () => {
    const results = streak(3, 3);
    expect(results[0]!.ease).toBeCloseTo(2.36, 10);
    expect(results[1]!.ease).toBeCloseTo(2.22, 10);
    expect(results[2]!.ease).toBeCloseTo(2.08, 10);
    expect(results[2]!.intervalDays).toBe(12);
  });

  it("dueAt = now + interval ngày (đúng ms, kể cả giờ lẻ)", () => {
    const oddNow = new Date("2026-10-03T09:41:23.456Z");
    const next = nextReview(
      { ease: 2.5, intervalDays: 6, reps: 2, quality: 5 },
      oddNow,
    );
    expect(next.dueAt.getTime()).toBe(
      oddNow.getTime() + next.intervalDays * DAY,
    );
  });
});

describe("nextReview — quên (q<3) reset", () => {
  it("q=0 sau chuỗi dài: reps reset 0, interval về 1, ease tụt mạnh (2.5 → 1.7)", () => {
    const next = nextReview(
      { ease: 2.5, intervalDays: 94, reps: 5, quality: 0 },
      NOW,
    );
    expect(next.reps).toBe(0);
    expect(next.intervalDays).toBe(1);
    expect(next.ease).toBeCloseTo(1.7, 10);
  });

  it("q=2 (suýt nhớ): vẫn là quên — reset như SM-2", () => {
    const next = nextReview(
      { ease: 2.8, intervalDays: 30, reps: 4, quality: 2 },
      NOW,
    );
    expect(next.reps).toBe(0);
    expect(next.intervalDays).toBe(1);
  });

  it("q=3 NGAY SAU reset: đếm lại từ rep 1 (interval 1), không kế thừa reps cũ", () => {
    const failed = nextReview(
      { ease: 2.5, intervalDays: 15, reps: 3, quality: 1 },
      NOW,
    );
    const recovered = nextReview(
      { ease: failed.ease, intervalDays: failed.intervalDays, reps: failed.reps, quality: 4 },
      NOW,
    );
    expect(recovered.reps).toBe(1);
    expect(recovered.intervalDays).toBe(1);
  });

  it("reset KHÔNG cộng dồn interval cũ (interval trước 94 → 1, không phải 95)", () => {
    const next = nextReview(
      { ease: 2.5, intervalDays: 94, reps: 5, quality: 2 },
      NOW,
    );
    expect(next.intervalDays).toBe(1);
  });
});

describe("nextReview — biên quality", () => {
  it("q=5 lặp: ease tiến về trần 2.8 và DỪNG ở đó (không vượt)", () => {
    const results = streak(5, 6);
    const eases = results.map((r) => r.ease);
    expect(eases[0]).toBeCloseTo(2.6, 10);
    expect(eases[1]).toBeCloseTo(2.7, 10);
    expect(eases[2]).toBeCloseTo(2.8, 10);
    expect(eases[3]).toBe(EASE_MAX);
    expect(eases[5]).toBe(EASE_MAX);
  });

  it("q=0 lặp từ ease thấp: ease chạm sàn 1.3 và DỪNG (không âm)", () => {
    let state = { ease: 1.6, intervalDays: 1, reps: 1 };
    let last = nextReview({ ...state, quality: 0 }, NOW);
    for (let i = 0; i < 10; i++) {
      state = { ease: last.ease, intervalDays: last.intervalDays, reps: last.reps };
      last = nextReview({ ...state, quality: 0 }, NOW);
      expect(last.ease).toBeGreaterThanOrEqual(EASE_MIN);
    }
    expect(last.ease).toBe(EASE_MIN);
  });

  it("quality ngoài biên bị kẹp: -1 → 0, 5.5 → 5, 4.5 làm tròn → 5", () => {
    const low = nextReview({ ease: 2.5, intervalDays: 1, reps: 1, quality: -1 }, NOW);
    const high = nextReview({ ease: 2.5, intervalDays: 1, reps: 1, quality: 5.5 }, NOW);
    const half = nextReview({ ease: 2.5, intervalDays: 1, reps: 1, quality: 4.5 }, NOW);
    expect(low.ease).toBeCloseTo(nextReview({ ease: 2.5, intervalDays: 1, reps: 1, quality: 0 }, NOW).ease, 10);
    expect(high.ease).toBeCloseTo(2.6, 10);
    expect(half.ease).toBeCloseTo(2.6, 10);
  });

  it("ease đầu vào lỗi (sửa tay DB 0 hoặc 99) → output vẫn trong 1.3–2.8", () => {
    const corrupt = nextReview({ ease: 99, intervalDays: 6, reps: 2, quality: 4 }, NOW);
    const negative = nextReview({ ease: 0, intervalDays: 6, reps: 2, quality: 4 }, NOW);
    for (const next of [corrupt, negative]) {
      expect(next.ease).toBeGreaterThanOrEqual(EASE_MIN);
      expect(next.ease).toBeLessThanOrEqual(EASE_MAX);
    }
  });

  it("reps/interval âm (DB lỗi) → xử lý như 0, không crash", () => {
    const next = nextReview({ ease: 2.5, intervalDays: -5, reps: -3, quality: 4 }, NOW);
    expect(next.reps).toBe(1);
    expect(next.intervalDays).toBe(1);
  });

  it("interval nhân ease KHÔNG bao giờ về 0 (ease sàn 1.3 × interval 1 ≥ 1)", () => {
    const next = nextReview({ ease: EASE_MIN, intervalDays: 1, reps: 5, quality: 4 }, NOW);
    expect(next.intervalDays).toBeGreaterThanOrEqual(1);
  });
});
