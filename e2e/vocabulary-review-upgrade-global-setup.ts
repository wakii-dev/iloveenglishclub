import { ensureReviewUpgradeFixture } from "./vocabulary-review-upgrade-fixture";

/**
 * GlobalSetup review-upgrade (SF-3 VU-40) — seed book+từ QA + WARM-UP
 * route/page (compile lạnh dev-server — cùng lý do suite 3317).
 */
export default async function reviewUpgradeGlobalSetup(): Promise<void> {
  await ensureReviewUpgradeFixture();
  const port = process.env.E2E_PORT ?? 3318;
  const base = `http://localhost:${port}`;
  await fetch(`${base}/api/vocabulary/session?kind=review`).catch(
    () => undefined,
  );
  await fetch(`${base}/en/me/vocabulary`).catch(() => undefined);
}
