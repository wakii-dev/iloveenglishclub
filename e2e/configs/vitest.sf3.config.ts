import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

// Config RIÊNG cho integration test SF-3 (VU-24 context pack): submit-attempt
// edge / XP modifiers / streak TZ / leaderboard boundary / me-stats — gọi
// action + query THẬT trên DB `ilec_sf3` (auth mock theo pattern
// scripts/test-rls.test.ts — sessionState hoisted).
// - KHÔNG lọt `npm test` (main vitest include src/** — file này ở scripts/)
// - KHÔNG đụng vitest.rls.config.ts (config dùng chung, SF-1 sở hữu)
// - nạp .env.local thủ công (vitest không tự đọc) → DB phải là ilec_sf3
dotenv.config({ path: ".env.local" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/sf3-*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // mỗi file tự quản cleanup fixture (afterAll) — tuần tự tránh giành DB
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
