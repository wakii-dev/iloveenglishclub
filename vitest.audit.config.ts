import { defineConfig } from "vitest/config";

// Config RIÊNG cho audit-tooling test (SF-8 — pattern test:rls):
// - KHÔNG lọt `npm test` (main vitest include src/** — file này ở scripts/)
// - scripts/lighthouse.mjs (node ESM) import audit-thresholds.mjs trực tiếp;
//   test ở đây bảo vệ cùng module — lane tách bạch, npm test (218) không đổi.
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/audit-thresholds.test.ts"],
  },
});
