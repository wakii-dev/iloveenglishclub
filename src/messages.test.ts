import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Convention messages PER-NAMESPACE (context pack SF-1):
 * mọi namespace của en phải tồn tại ở vi và NGƯỢC LẠI, với cùng bộ keys
 * (flatten) — chống lệch bản dịch khi SF sau thêm namespace chỉ 1 phía.
 */

const MESSAGES_ROOT = path.resolve(__dirname, "../messages");

function loadLocale(locale: string): Record<string, unknown> {
  const dir = path.join(MESSAGES_ROOT, locale);
  const namespaces = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return Object.fromEntries(
    namespaces.map((f) => [
      path.basename(f, ".json"),
      JSON.parse(readFileSync(path.join(dir, f), "utf8")),
    ]),
  );
}

function flattenKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flattenKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("messages per-namespace parity EN⇄VI", () => {
  const en = loadLocale("en");
  const vi = loadLocale("vi");

  it("cùng bộ namespace file", () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
  });

  it.each([
    ["en", vi, en] as const,
    ["vi", en, vi] as const,
  ])("mọi keys của %s tồn tại ở phía kia", (_name, a, b) => {
    const keysA = Object.entries(a).flatMap(([ns, value]) =>
      flattenKeys(value).map((k) => `${ns}.${k}`),
    );
    const keysB = new Set(
      Object.entries(b).flatMap(([ns, value]) =>
        flattenKeys(value).map((k) => `${ns}.${k}`),
      ),
    );
    const missing = keysA.filter((k) => !keysB.has(k));
    expect(missing).toEqual([]);
  });

  it("namespace trống cho SF sau (lesson/admin/gamification) là object rỗng", () => {
    for (const ns of ["lesson", "admin", "gamification"]) {
      expect(en[ns]).toEqual({});
      expect(vi[ns]).toEqual({});
    }
  });
});
