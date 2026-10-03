import { ensureLookupFixture } from "./vocabulary-lookup-fixture";

/** GlobalSetup word-lookup (SF-5 t-5.3) — seed từ QA + gate bảng (pattern SF-2/3/4). */
export default async function lookupGlobalSetup(): Promise<void> {
  await ensureLookupFixture();
}
