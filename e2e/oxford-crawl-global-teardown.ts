import dotenv from "dotenv";
import { cleanupOxfordCrawlFixture } from "./oxford-crawl-fixture";

/** Teardown SF-3 crawl UI — sweep fixture QA theo prefix (words → book →
 * crawl_entries). Re-run an toàn khi run trước crash giữa chừng. */
export default async function oxfordCrawlGlobalTeardown(): Promise<void> {
  dotenv.config({ path: ".env.local" });
  await cleanupOxfordCrawlFixture();
}
