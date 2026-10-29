import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * ilec-v2 — adapt từ vitest.config.ts của ilec: giữ alias `@` + oxc jsx
 * runtime (Next tsconfig không khớp oxc transform). Bỏ section coverage của
 * ilec (scope dictation/content SF-3 của ilec) — thêm lại khi SF tương ứng
 * port xong. Chưa có test nào trong SF1.
 */
export default defineConfig({
  // Vite 8 transform qua Oxc — tsconfig `jsx: react-jsx` (của Next 16) vẫn
  // force automatic runtime tại ĐÂY cho .tsx trong test graph; không ảnh
  // hưởng Next build (SWC riêng).
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
