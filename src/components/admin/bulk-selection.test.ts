import { describe, expect, it } from "vitest";

/**
 * bulk-selection tier-0 (VU-43 SF-1 task 13) — contract spec §2.5: selection
 * GIỮ qua refetch trang (Set theo id), togglePage chọn/bỏ trang hiện tại,
 * clear. Repo không có DOM-test infra (vitest environment node) → test PURE
 * legs (toggleSelectionId / toggleSelectionPage / activeVocabularyTab) —
 * hook chỉ wrap setState quanh 2 hàm này; UI render e2e thuộc SF-2/3/4.
 */
import {
  toggleSelectionId,
  toggleSelectionPage,
} from "./bulk-selection";
import { activeVocabularyTab, VOCABULARY_TABS } from "./vocabulary-sub-nav";

describe("toggleSelectionId (§2.5)", () => {
  it("thêm id chưa có / bỏ id đã chọn — immutable (Set gốc không đổi)", () => {
    const prev = new Set<string | number>([1]);
    const next = toggleSelectionId(prev, 2);
    expect(next.has(2)).toBe(true);
    expect(prev.has(2)).toBe(false); // prev giữ nguyên
    const after = toggleSelectionId(next, 2);
    expect(after.has(2)).toBe(false);
    expect(next.has(2)).toBe(true);
  });

  it("id dạng number và string phân biệt (wordId number — contract)", () => {
    const next = toggleSelectionId(new Set(), "1");
    expect(next.has(1)).toBe(false);
    expect(next.has("1")).toBe(true);
  });
});

describe("toggleSelectionPage (§2.5)", () => {
  it("chưa chọn đủ trang → chọn cả trang, GIỮ selection trang khác", () => {
    const prev = new Set<string | number>([99]); // trang khác đã chọn
    const next = toggleSelectionPage(prev, [1, 2, 3]);
    expect([...next].sort((a, b) => Number(a) - Number(b))).toEqual([1, 2, 3, 99]);
  });

  it("đã chọn đủ trang → BỎ đúng trang đó, giữ id trang khác", () => {
    const prev = new Set<string | number>([1, 2, 3, 99]);
    const next = toggleSelectionPage(prev, [1, 2, 3]);
    expect([...next]).toEqual([99]);
  });

  it("trang rỗng → không đổi (every trên mảng rỗng = true — guard length>0)", () => {
    const prev = new Set<string | number>([1]);
    const next = toggleSelectionPage(prev, []);
    expect(next.has(1)).toBe(true);
  });
});

describe("activeVocabularyTab (sub-nav — pathname chính xác)", () => {
  it("active đúng href chính xác; /admin/vocabulary/crawl KHÔNG làm Catalog active", () => {
    expect(activeVocabularyTab("/admin/vocabulary")).toBe("catalog");
    expect(activeVocabularyTab("/admin/vocabulary/curation")).toBe("curation");
    expect(activeVocabularyTab("/admin/vocabulary/stats")).toBe("stats");
    expect(activeVocabularyTab("/admin/vocabulary/crawl")).toBeNull();
    expect(activeVocabularyTab("/admin/vocabulary/")).toBeNull(); // exact match
    expect(activeVocabularyTab("/admin")).toBeNull();
  });

  it("3 tabs pin contract: href không đổi cho SF-2/3/4 render", () => {
    expect(VOCABULARY_TABS.map((t) => t.href)).toEqual([
      "/admin/vocabulary",
      "/admin/vocabulary/curation",
      "/admin/vocabulary/stats",
    ]);
  });
});
