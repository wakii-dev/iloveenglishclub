import { ensureReviewWordsFixture } from "./vocabulary-review-fixture";

/** GlobalSetup review flow (SF-3 t-3.3) — seed từ QA + gate bảng (pattern SF-2). */
export default async function reviewGlobalSetup(): Promise<void> {
  await ensureReviewWordsFixture();
}
