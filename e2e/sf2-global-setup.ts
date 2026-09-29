import { ensureScoringFixture } from "./sf2-db";

/** GlobalSetup SF-2 — CHỈ fixture DB (không admin: suite này không login admin).
 *  Chạy trước tests để unstable_cache `content` lần đầu query thấy fixture. */
export default async function sf2GlobalSetup(): Promise<void> {
  await ensureScoringFixture();
}
