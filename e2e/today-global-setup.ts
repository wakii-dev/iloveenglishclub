import {
  ensureTodayWordsFixture,
  seedTodayUserA,
  seedTodayUserB,
} from "./today-fixture";

/**
 * GlobalSetup /today 3321 (daily-journey SF-3, VU-51): seed words
 * qa-today-w* vào level-5 + 2 user PIN quest-hash RUNTIME SEARCH (A: set
 * chứa q-review-5 — quest/badge spec; B: set sạch — page/dot spec) trước
 * webServer (pattern vocabulary-dashboard-global-setup).
 */
export default async function todayGlobalSetup(): Promise<void> {
  await ensureTodayWordsFixture();
  await seedTodayUserA();
  await seedTodayUserB();
}
