import { cleanupHubFixture } from "./vocabulary-hub-fixture";

/** GlobalTeardown hub quiz tổng (SF-3 t-3.3) — xoá words qa-hub-*
 * (cascade book_words + user_word_progress), pattern vocabulary-hub. */
export default async function vocabularyHubQuizGlobalTeardown(): Promise<void> {
  await cleanupHubFixture();
}
