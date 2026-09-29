/**
 * vocab_level choices (SF-5) — copy giá trị enum ở src/db/schema.ts
 * (vocabLevelEnum) ra const client-safe: client components không import
 * schema (kéo drizzle pg-core vào bundle).
 */
export const VOCAB_LEVELS = [
  "Pre-A1",
  "A1",
  "A2",
  "A2+",
  "B1",
  "B1+",
  "B2",
  "B2+",
] as const;

export type VocabLevel = (typeof VOCAB_LEVELS)[number];
