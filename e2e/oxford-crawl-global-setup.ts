import dotenv from "dotenv";
import { upsertAdmin } from "../scripts/create-admin";
import {
  ensureOxfordCrawlFixture,
  cleanupOxfordCrawlFixture,
} from "./oxford-crawl-fixture";

/**
 * GlobalSetup SF-3 crawl UI (VU-35): nạp .env.local → upsert admin (specs
 * login qua loginAsAdmin — pattern global-setup admin) → seed fixture QA
 * TRƯỚC khi server bind (unstable_cache `content` lần đầu query thấy fixture
 * — pattern vocabulary config). Fixture info in stdout cho specs đối chiếu.
 *
 * Fixture info truyền cho specs qua env không được (worker process riêng) —
 * specs tự đọc DB theo PREFIX (book slug LIKE 'qa-sf3-%', word LIKE 'qasf3-%')
 * — luôn đúng 1 bộ fixture active vì setup sweep sạch trước khi seed.
 */
export default async function oxfordCrawlGlobalSetup(): Promise<void> {
  dotenv.config({ path: ".env.local" });
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 8) {
    throw new Error(
      "ADMIN_EMAIL/ADMIN_PASSWORD thiếu (password ≥ 8) — set trong .env.local",
    );
  }
  await upsertAdmin(email, password, "Admin SF3");
  const info = await ensureOxfordCrawlFixture();
  console.log(
    `[oxford-crawl-fixture] book=${info.bookSlug} id=${info.bookId} words tree=${info.wordIds.tree}`,
  );
  // giữ tham chiếu cleanup để tree-shake không bỏ import (teardown dùng file riêng)
  void cleanupOxfordCrawlFixture;
}
