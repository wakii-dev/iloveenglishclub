import { cleanupReviewFixture } from "./vocabulary-review-fixture";

/** GlobalTeardown review flow (SF-3 t-3.3) — xoá từ QA (cascade progress). */
export default async function reviewGlobalTeardown(): Promise<void> {
  await cleanupReviewFixture();
}
