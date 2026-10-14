import {
  ensureTodayWordsFixture,
  seedTodayShieldUser,
  seedTodayUserA,
  seedTodayUserB,
} from "./today-fixture";

/**
 * GlobalSetup /today 3321 (daily-journey SF-3, VU-51): seed words
 * qa-today-w* vào level-5 + 2 user PIN quest-hash RUNTIME SEARCH (A: set
 * chứa q-review-5 — quest/badge spec; B: set sạch — page/dot spec) trước
 * webServer (pattern vocabulary-dashboard-global-setup). SF-4 (VU-52):
 * thêm 2 shield user — A credits 1 (gap hôm-qua được bắc cầu), B credits 0
 * (identity — streak reset 1).
 */
export default async function todayGlobalSetup(): Promise<void> {
  await ensureTodayWordsFixture();
  await seedTodayUserA();
  await seedTodayUserB();
  await seedTodayShieldUser("a", 1);
  await seedTodayShieldUser("b", 0);
  await seedTodayShieldUser("c", 2); // /me acceptance — badges + shield hint
}
