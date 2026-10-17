import { ensureScoringFixture } from "./sf2-db";

/**
 * GlobalSetup config ROOT (dictation lane — port 3110): seed fixture lesson
 * 99 "QA-SF2 scoring edges" (sf2-db.ts). Trước đây fixture seed thủ công
 * thời SF-2 — giờ mồ côi (config root không globalSetup, specs không gọi
 * ensure) → lesson 404 → Start gate không render (base-parity trên DB clone
 * thiếu lesson 99 — dictation-scoring-edges + dictation-audio-controls:89).
 */
export default async function dictationGlobalSetup(): Promise<void> {
  await ensureScoringFixture();
}
