import "dotenv/config";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit không tự đọc .env.local (Next convention) — nạp thủ công,
// .env làm fallback, không ghi đè giá trị có sẵn
dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
