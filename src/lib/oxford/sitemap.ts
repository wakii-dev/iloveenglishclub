/**
 * Sitemap enumerate (VU-32 SF-1): /sitemap.xml index → các sub-sitemap
 * `/sitemap/english/sitemap*.xml` (CHỈ english — các dictionary khác
 * american_english/... KHÔNG lấy) → slugs `/definition/english/<slug>`.
 *
 * Lọc 2 lớp:
 * - path prefix `/definition/english/` (hard-filter)
 * - robots Disallow prefix (defense-in-depth — parseRobots nhóm *; hiện tại
 *   english gần no-op vì Disallow là academic/collocations..., giữ để Oxford
 *   đổi policy thì tự lọc)
 *
 * PURE — fetchImpl inject; XML phẳng parse bằng regex <loc> (sitemap chỉ chứa
 * URL, không cần DOM). Slug decode giống slugFromUrl (fetch.ts) — upsert key
 * nhất quán với redirect final.
 */

import { isAllowed, parseRobots } from "./robots";
import {
  DEFAULT_TIMEOUT_MS,
  ENTRY_HOST_SUFFIX,
  HttpError,
  TimeoutError,
  slugFromUrl,
} from "./fetch";

/** Fetch XML — check res.ok (500 → throw, KHÔNG [] lặng lẽ) + timeout 15s. */
async function fetchText(doFetch: typeof fetch, url: string): Promise<string> {
  let res: Response;
  try {
    res = await doFetch(url, { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new TimeoutError(url);
    }
    throw err;
  }
  if (!res.ok) throw new HttpError(res.status, url);
  return res.text();
}

export const SITEMAP_INDEX_URL =
  "https://www.oxfordlearnersdictionaries.com/sitemap.xml";
export const DEFINITION_ENGLISH_PREFIX = "/definition/english/";

export type SitemapDeps = {
  fetchImpl?: typeof fetch;
  /** Robots text inject (test) — mặc định fetch https://.../robots.txt. */
  robotsText?: string;
  /** Chỉ lấy N sub-sitemap đầu (test/dry-run partial). */
  maxSitemaps?: number;
};

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

export async function fetchSlugs(deps: SitemapDeps = {}): Promise<string[]> {
  const doFetch: typeof fetch = deps.fetchImpl ?? fetch;

  // robots policy — defense-in-depth filter
  let robotsText: string;
  if (deps.robotsText !== undefined) {
    robotsText = deps.robotsText;
  } else {
    robotsText = await fetchText(doFetch, "https://www.oxfordlearnersdictionaries.com/robots.txt");
  }
  const policy = parseRobots(robotsText, "*");

  const indexXml = await fetchText(doFetch, SITEMAP_INDEX_URL);
  const englishSitemaps = extractLocs(indexXml)
    .filter((url) => /\/sitemap\/english\/sitemap\d*\.xml$/.test(url))
    // hostname allowlist — index là nguồn tin cậy nhưng vẫn chặn (reviewer P2)
    .filter((url) => new URL(url).hostname.endsWith(ENTRY_HOST_SUFFIX))
    .slice(0, deps.maxSitemaps ?? Infinity);

  const slugs = new Set<string>();
  for (const sitemapUrl of englishSitemaps) {
    const xml = await fetchText(doFetch, sitemapUrl);
    for (const loc of extractLocs(xml)) {
      let path: string;
      try {
        path = new URL(loc).pathname;
      } catch {
        continue;
      }
      if (!path.startsWith(DEFINITION_ENGLISH_PREFIX)) continue;
      if (!isAllowed(policy, path)) continue;
      slugs.add(slugFromUrl(loc));
    }
  }
  return [...slugs];
}
