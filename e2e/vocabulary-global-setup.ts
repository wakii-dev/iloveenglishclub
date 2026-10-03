import { ensureVocabularyFixture } from "./vocabulary-fixture";

/** GlobalSetup vocabulary (SF-2 t-2.3) — chỉ seed fixture; chạy trước webServer
 * để unstable_cache `content` lần đầu query thấy fixture (pattern sf2). */
export default async function vocabularyGlobalSetup(): Promise<void> {
  await ensureVocabularyFixture();
}
