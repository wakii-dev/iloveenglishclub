import { cleanupQuizUsers, ensureQuizAttemptsNullable } from "./vocabulary-hub-quiz-fixture";
import { ensureHubWordsFixture } from "./vocabulary-hub-fixture";

/**
 * GlobalSetup hub quiz tổng (SF-3 t-3.3) — seed words qa-hub-* (fixture hub)
 * + gate migration 0003 (quiz_attempts.book_id nullable) trước webServer.
 * Progress/attempt do spec tự tạo (đăng ký qua UI). Dọn user qa-hubquiz-* các
 * run trước trước hết — top-users assert strict theo display name.
 */
export default async function vocabularyHubQuizGlobalSetup(): Promise<void> {
  await cleanupQuizUsers();
  await ensureHubWordsFixture();
  await ensureQuizAttemptsNullable();
}
