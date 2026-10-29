import { describe, expect, it } from "vitest";

/**
 * AdminNav active rule (VU-43 SF-2 t1) — item "Từ vựng" (href
 * /admin/vocabulary) tranh prefix với item Crawl (/admin/vocabulary/crawl):
 * rule explicit — Từ vựng active khi prefix /admin/vocabulary TRỪ /crawl.
 * e2e double-active: admin-vocabulary-nav.spec.ts (SF-2, §6.7).
 */
import { adminNavActive, adminVocabularyNavActive } from "./admin-nav";

describe("adminVocabularyNavActive (rule explicit chống prefix-tranh)", () => {
  it("active trên /admin/vocabulary (cả với trailing path con khác crawl)", () => {
    expect(adminVocabularyNavActive("/admin/vocabulary")).toBe(true);
    expect(adminVocabularyNavActive("/admin/vocabulary/xyz")).toBe(true);
  });

  it("KHÔNG active trên /admin/vocabulary/crawl — chỉ Crawl active", () => {
    expect(adminVocabularyNavActive("/admin/vocabulary/crawl")).toBe(false);
    expect(adminVocabularyNavActive("/admin/vocabulary/crawl/sub")).toBe(false);
  });

  it("không khớp prefix khác (users/books/dashboard)", () => {
    expect(adminVocabularyNavActive("/admin/users")).toBe(false);
    expect(adminVocabularyNavActive("/admin")).toBe(false);
    expect(adminVocabularyNavActive("/admin/books")).toBe(false);
  });
});

describe("adminNavActive (toàn nav)", () => {
  it("dashboard chỉ khớp chính xác /admin", () => {
    expect(adminNavActive("/admin", "/admin")).toBe(true);
    expect(adminNavActive("/admin", "/admin/books")).toBe(false);
  });

  it("Từ vựng + Crawl đồng thời trên /admin/vocabulary/crawl → đúng 1 active", () => {
    const pathname = "/admin/vocabulary/crawl";
    expect(adminNavActive("/admin/vocabulary", pathname)).toBe(false);
    expect(adminNavActive("/admin/vocabulary/crawl", pathname)).toBe(true);
  });

  it("còn lại theo prefix startsWith", () => {
    expect(adminNavActive("/admin/books", "/admin/books/abc/vocabulary")).toBe(
      true,
    );
    expect(adminNavActive("/admin/users", "/admin/users")).toBe(true);
  });
});
