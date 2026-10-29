import { cleanupHubFixture } from "./vocabulary-hub-fixture";

/** GlobalTeardown smoke v2 (migrate SF4) — xoá words qa-hub-* (cascade
 * book_words + user_word_progress), pattern vocabulary-hub-global-teardown. */
export default async function smokeGlobalTeardown(): Promise<void> {
  await cleanupHubFixture();
}
