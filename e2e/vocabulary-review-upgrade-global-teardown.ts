import { cleanupReviewUpgradeFixture } from "./vocabulary-review-upgrade-fixture";

/** GlobalTeardown review-upgrade (SF-3 VU-40) — self-clean words + book QA. */
export default async function reviewUpgradeGlobalTeardown(): Promise<void> {
  await cleanupReviewUpgradeFixture();
}
