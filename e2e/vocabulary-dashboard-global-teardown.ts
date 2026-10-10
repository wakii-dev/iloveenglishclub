import { cleanupDashboardFixture } from "./vocabulary-dashboard-fixture";

/** GlobalTeardown dashboard 3319 (SF-4, VU-41) — xoá words qa-dash-*
 * (cascade book_words + progress + vocab_activity), pattern vocabulary-hub. */
export default async function vocabularyDashboardGlobalTeardown(): Promise<void> {
  await cleanupDashboardFixture();
}
