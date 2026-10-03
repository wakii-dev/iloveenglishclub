import { cleanupVocabularyFixture } from "./vocabulary-fixture";

/** GlobalTeardown vocabulary (SF-2 t-2.3) — xoá fixture QA khỏi words. */
export default async function vocabularyGlobalTeardown(): Promise<void> {
  await cleanupVocabularyFixture();
}
