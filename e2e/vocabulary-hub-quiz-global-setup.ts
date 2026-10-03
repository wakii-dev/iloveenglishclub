import { ensureHubWordsFixture } from "./vocabulary-hub-fixture";
import { ensureQuizAttemptsNullable } from "./vocabulary-hub-quiz-fixture";

/**
 * GlobalSetup hub quiz tổng (SF-3 t-3.3) — seed words qa-hub-* (fixture hub)
 * + gate migration 0003 (quiz_attempts.book_id nullable) trước webServer.
 * Progress/attempt do spec tự tạo (đăng ký qua UI). */
export default async function vocabularyHubQuizGlobalSetup(): Promise<void> {
  await ensureHubWordsFixture();
  await ensureQuizAttemptsNullable();
}
