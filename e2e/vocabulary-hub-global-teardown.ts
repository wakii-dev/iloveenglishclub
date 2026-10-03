import { cleanupHubFixture } from "./vocabulary-hub-fixture";

/** GlobalTeardown vocabulary hub (SF-1 t-1.3) — xoá words qa-hub-*
 * (cascade book_words + user_word_progress), pattern vocabulary-review. */
export default async function vocabularyHubGlobalTeardown(): Promise<void> {
  await cleanupHubFixture();
}
