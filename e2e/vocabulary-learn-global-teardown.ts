import { cleanupLearnFixture } from "./vocabulary-learn-fixture";

/** GlobalTeardown vocabulary learn (sf-1) — xoá words qa-learn-*
 * (cascade book_words + user_word_progress), pattern vocabulary-hub. */
export default async function vocabularyLearnGlobalTeardown(): Promise<void> {
  await cleanupLearnFixture();
}
