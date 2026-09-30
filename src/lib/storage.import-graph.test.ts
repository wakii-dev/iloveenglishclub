import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { join } from "node:path";

/**
 * Regression cho bug deploy `3617eed` (2026-09-29): client bundle kéo
 * `@vercel/blob` (và gián tiếp `node:fs/promises`) qua `lib/storage.ts` →
 * webpack client build chết UnhandledSchemeError trên Vercel.
 *
 * Hợp đồng sau split: `lib/storage.ts` = client-safe (pure URL/path helpers,
 * KHÔNG import node-only); mọi ghi/xóa audio nằm ở `lib/storage-server.ts`
 * (server-only, giữ `@vercel/blob`). Mutation RED→GREEN: revert tạm
 * `3617eed` (đưa putAudio về storage.ts) → test này ĐỎ → restore → GREEN.
 */

const LIB = join(__dirname, "..", "lib");

describe("regression 3617eed — storage client-safe contract", () => {
  it("lib/storage.ts KHÔNG import @vercel/blob (client bundle an toàn)", () => {
    const src = readFileSync(join(LIB, "storage.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']@vercel\/blob["']/);
    expect(src).not.toMatch(/require\(["']@vercel\/blob["']\)/);
  });

  it("lib/storage.ts KHÔNG import node:fs/promises (nguồn UnhandledSchemeError)", () => {
    const src = readFileSync(join(LIB, "storage.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']node:fs/);
    expect(src).not.toMatch(/require\(["']node:fs/);
  });

  it("ghi/xóa audio nằm ở lib/storage-server.ts với guard server-only", () => {
    const server = readFileSync(join(LIB, "storage-server.ts"), "utf8");
    // server-only phải là dòng import đầu — chặn build-time mọi import từ client
    expect(server.trimStart()).toMatch(/^import\s+["']server-only["'];/);
    expect(server).toMatch(/from\s+["']@vercel\/blob["']/);
  });
});
