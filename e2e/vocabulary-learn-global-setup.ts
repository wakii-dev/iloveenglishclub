import { ensureLearnWordsFixture } from "./vocabulary-learn-fixture";

/** GlobalSetup vocabulary learn (sf-1) — seed words qa-learn-* trước webServer
 * (pattern vocabulary-hub-global-setup.ts); progress do flow tự sinh. */
export default async function vocabularyLearnGlobalSetup(): Promise<void> {
  await ensureLearnWordsFixture();
}
