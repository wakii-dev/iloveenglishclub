import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

// Config RIÊNG cho integration test daily-journey SF-1 (VU-49): migration
// 0007 dry-run + listen_ms write-path — gọi action THẬT trên DB clone
// `ilec_vu48_sf1` (auth mock theo pattern scripts/test-rls.test.ts —
// sessionState hoisted; KHÔNG mock action/db).
// - KHÔNG lọt `npm test`/CI (main vitest include src/** — file này ở scripts/)
// - KHÔNG đụng vitest.rls.config.ts / vitest.sf3.config.ts (config SF khác)
// - nạp .env.local thủ công (vitest không tự đọc) → DATABASE_URL phải là
//   ilec_vu48_sf1 (guard trong test file)
dotenv.config({ path: ".env.local" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/sf1-*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // fixture tự quản cleanup (afterAll) + reset migration state — tuần tự
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
