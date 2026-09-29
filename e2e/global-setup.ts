import dotenv from "dotenv";
import { upsertAdmin } from "../scripts/create-admin";
import { ensureAttemptFixture } from "./seed-attempts";

/**
 * GlobalSetup E2E (SF-5): nạp .env.local → tạo/nâng admin (ADMIN_EMAIL/
 * ADMIN_PASSWORD) → seed attempt fixture (ACCEPTANCE #5). Playwright bundle
 * qua esbuild — import extensionless OK ở thư mục e2e/.
 */
export default async function globalSetup() {
  dotenv.config({ path: ".env.local" });
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 8) {
    throw new Error(
      "ADMIN_EMAIL/ADMIN_PASSWORD thiếu (password ≥ 8) — set trong .env.local",
    );
  }
  await upsertAdmin(email, password, "Admin");
  await ensureAttemptFixture();
}
