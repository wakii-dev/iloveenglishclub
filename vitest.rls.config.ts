import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

// Config RIÊNG cho authorization test (context pack SF-2: "RLS test script
// assert từng role" — pivot app-level, xem REQUIREMENT-GAP VU-15):
// - KHÔNG lọt `npm test`/CI (main vitest include src/** — file này ở scripts/)
// - cần DB local + seed: npm run db:migrate && npm run db:seed trước
// - nạp .env.local thủ công (vitest không tự đọc)
dotenv.config({ path: ".env.local" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/test-rls.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
