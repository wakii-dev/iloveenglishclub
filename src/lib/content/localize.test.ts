import { describe, expect, it } from "vitest";
import { localize } from "./localize";

describe("localize — fallback chain vi→en→raw (spec §8)", () => {
  const both = { en: "Free time", vi: "Thời gian rảnh" };

  it("vi locale: ưu tiên vi", () => {
    expect(localize("vi", both)).toBe("Thời gian rảnh");
  });

  it("en locale: ưu tiên en", () => {
    expect(localize("en", both)).toBe("Free time");
  });

  it("vi thiếu → rơi sang en (ACCEPTANCE: title_vi thiếu hiện tiếng Anh, không rỗng)", () => {
    expect(localize("vi", { en: "Free time", vi: null })).toBe("Free time");
    expect(localize("vi", { en: "Free time", vi: "   " })).toBe("Free time");
  });

  it("cả hai thiếu → fallbackRaw (raw = chốt cuối chuỗi)", () => {
    expect(localize("vi", { en: null, vi: null }, "unit-3")).toBe("unit-3");
    expect(localize("en", { en: "", vi: "" }, "level-1")).toBe("level-1");
  });

  it("cả hai thiếu, không raw → rỗng (caller quyết định hiển thị mặc định)", () => {
    expect(localize("vi", { en: null, vi: null })).toBe("");
  });

  it("en locale thiếu en → rơi sang vi trước raw", () => {
    expect(localize("en", { en: null, vi: "Thời gian rảnh" })).toBe(
      "Thời gian rảnh",
    );
    expect(localize("en", { en: null, vi: "Thời gian rảnh" }, "u1")).toBe(
      "Thời gian rảnh",
    );
  });
});
