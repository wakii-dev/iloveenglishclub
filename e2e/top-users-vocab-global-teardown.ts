import { cleanupTopUsersFixture } from "./top-users-vocab-fixture";

/** GlobalTeardown top-users-vocab 3320 — tidy user + word QA (pattern
 * vocabulary-dashboard-global-teardown). */
export default async function topUsersVocabGlobalTeardown(): Promise<void> {
  await cleanupTopUsersFixture();
}
