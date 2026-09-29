import { describe, expect, it } from "vitest";
import { validatePublish } from "./publish";

/** SF-5 T3 — publish gate: 100% nhánh (empty/missing text/missing audio/pass). */

const ok = (sortOrder: number) => ({
  sortOrder,
  text: `Sentence ${sortOrder}.`,
  audioPath: `audio/level-3/unit-1/lesson-1/0${sortOrder}.mp3`,
});

describe("validatePublish", () => {
  it("empty lesson → chặn, missing=[0] (không có part để trỏ)", () => {
    expect(validatePublish([])).toEqual({ ok: false, missing: [0] });
  });

  it("mọi part đủ text + audio → ok", () => {
    expect(validatePublish([ok(1), ok(2)])).toEqual({ ok: true, missing: [] });
  });

  it("part thiếu audio → chặn, missing=[số part đó]", () => {
    const parts = [ok(1), { ...ok(2), audioPath: null }];
    expect(validatePublish(parts)).toEqual({ ok: false, missing: [2] });
  });

  it("part text rỗng/trắng → chặn", () => {
    const parts = [ok(1), { ...ok(2), text: "   " }];
    expect(validatePublish(parts)).toEqual({ ok: false, missing: [2] });
  });

  it("nhiều part thiếu → missing liệt kê đủ theo sortOrder", () => {
    const parts = [
      { ...ok(1), audioPath: null },
      ok(2),
      { ...ok(3), text: "" },
      { ...ok(4), audioPath: null },
    ];
    expect(validatePublish(parts)).toEqual({ ok: false, missing: [1, 3, 4] });
  });

  it("duration_ms không nằm trong điều kiện gate (nullable OK — spec §4)", () => {
    // spread object — không dính excess-property check của literal
    const parts = [{ ...ok(1), durationMs: null }];
    expect(validatePublish(parts)).toEqual({ ok: true, missing: [] });
  });
});
