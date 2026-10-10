import { ensureDashboardWordsFixture } from "./vocabulary-dashboard-fixture";

/** GlobalSetup dashboard 3319 (SF-4, VU-41) — seed words qa-dash-* vào
 * level-5/level-6 trước webServer (pattern vocabulary-hub-global-setup). */
export default async function vocabularyDashboardGlobalSetup(): Promise<void> {
  await ensureDashboardWordsFixture();
}
