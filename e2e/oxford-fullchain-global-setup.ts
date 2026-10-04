import dotenv from "dotenv";
import { upsertAdmin } from "../scripts/create-admin";
import {
  ensureOxfordFullchainFixture,
  cleanupOxfordFullchainFixture,
} from "./oxford-fullchain-fixture";

/**
 * GlobalSetup SF-4 fullchain (VU-36): nạp .env.local → upsert admin (specs
 * login qua loginAsAdmin cho leg crawl-on-add/enrich — pattern SF-3) → seed
 * fixture QA TRƯỚC khi server bind (unstable_cache `content` lần đầu query
 * thấy fixture — pattern vocabulary config).
 */
export default async function oxfordFullchainGlobalSetup(): Promise<void> {
  dotenv.config({ path: ".env.local" });
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 8) {
    throw new Error(
      "ADMIN_EMAIL/ADMIN_PASSWORD thiếu (password ≥ 8) — set trong .env.local",
    );
  }
  await upsertAdmin(email, password, "Admin SF4");
  const info = await ensureOxfordFullchainFixture();
  console.log(
    `[oxford-fullchain-fixture] book=${info.bookSlug} id=${info.bookId}`,
  );
  // giữ tham chiếu cleanup để tree-shake không bỏ import (teardown dùng file riêng)
  void cleanupOxfordFullchainFixture;
}
