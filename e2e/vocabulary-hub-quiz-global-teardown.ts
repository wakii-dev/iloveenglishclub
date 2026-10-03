import { cleanupHubFixture } from "./vocabulary-hub-fixture";
import { cleanupQuizUsers } from "./vocabulary-hub-quiz-fixture";

/** GlobalTeardown hub quiz tổng (SF-3 t-3.3) — xoá words qa-hub-*
 * (cascade book_words + user_word_progress) + user qa-hubquiz-* (cascade
 * profiles + quiz_attempts), pattern vocabulary-hub. */
export default async function vocabularyHubQuizGlobalTeardown(): Promise<void> {
  await cleanupHubFixture();
  await cleanupQuizUsers();
}
