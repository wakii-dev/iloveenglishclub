import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Coverage 100% nhánh CHỈ các module dictation/content của SF-3
    // (spec §4 — scope hẹp, không siết file SF-1 sẵn có).
    // Gate chấp nhận: `npx vitest run --coverage` (thresholds chỉ hiệu lực
    // với --coverage); CI chạy `npm test` thường (nhanh).
    coverage: {
      provider: "v8",
      include: ["src/lib/dictation/**", "src/lib/content/split-sentences.ts"],
      exclude: ["**/*.test.ts"],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
