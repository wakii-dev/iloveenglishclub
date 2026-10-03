import { ensureHubWordsFixture } from "./vocabulary-hub-fixture";

/** GlobalSetup vocabulary hub (SF-1 t-1.3) — seed words qa-hub-* trước webServer
 * (pattern vocabulary-global-setup.ts); progress do spec seed giữa test. */
export default async function vocabularyHubGlobalSetup(): Promise<void> {
  await ensureHubWordsFixture();
}
