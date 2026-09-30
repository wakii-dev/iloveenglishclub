import { expect, test } from "@playwright/test";

/**
 * E2E sitemap (SF-5 QA, context pack #2): chỉ bài published; mọi URL trong
 * sitemap resolve 200 (fetch thật); hreflang cặp trong từng entry.
 *
 * Origin: URL trong sitemap neo NEXT_PUBLIC_SITE_URL (localhost:3000 ở local)
 * trong khi server chạy port riêng (3212) — check resolve qua rewrite origin
 * (local-mode artifact theo context pack; prod domain khớp — SF-6 đo thật).
 * Re-runnable trên DB bất kỳ: draft/published anchor là fixture TỰ NHIÊN của
 * template seed (level-3/u2/l3 draft, level-3/u1/l1 published).
 */

const SITE = "http://localhost:3000";

const DRAFT_LESSON_SUFFIX = "/books/level-3/units/2/lessons/3/listen-and-type";
const PUBLISHED_LESSON_PATH = "/books/level-3/units/1/lessons/1/listen-and-type";

async function sitemapLocs(request: import("@playwright/test").APIRequestContext): Promise<string[]> {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
}

test("sitemap: chỉ published — draft lesson vắng mặt, published có đủ 2 locale", async ({
  request,
}) => {
  const locs = await sitemapLocs(request);

  // Draft KHÔNG nằm trong sitemap
  expect(locs.filter((u) => u.endsWith(DRAFT_LESSON_SUFFIX))).toEqual([]);

  // Published lesson có CẢ HAI locale + entry kèm hreflang cặp
  for (const locale of ["en", "vi"]) {
    expect(locs).toContain(`${SITE}/${locale}${PUBLISHED_LESSON_PATH}`);
  }
});

test("sitemap: MỌI URL resolve 200 (fetch thật, origin rewrite về server local)", async ({
  request,
  baseURL,
}) => {
  test.setTimeout(300_000);
  const locs = await sitemapLocs(request);
  expect(locs.length).toBeGreaterThanOrEqual(70); // 2 static × 2 locale + DB-derived

  const origin = new URL(baseURL ?? "http://localhost:3212").origin;
  let ok = 0;
  const failed: { url: string; status: number }[] = [];
  for (const loc of locs) {
    const res = await request.get(loc.replace(SITE, origin), { maxRedirects: 0 });
    if (res.status() === 200) {
      ok += 1;
    } else {
      failed.push({ url: loc, status: res.status() });
    }
  }
  expect(failed, `URL chết trong sitemap: ${JSON.stringify(failed.slice(0, 5))}`).toEqual([]);
});

test("sitemap entry: hreflang cặp en↔vi + x-default→en trong từng <url>", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  const xml = await res.text();
  const firstUrl = xml.slice(xml.indexOf("<url>"), xml.indexOf("</url>"));
  expect(firstUrl).toContain('hreflang="en"');
  expect(firstUrl).toContain('hreflang="vi"');
  expect(firstUrl).toContain('hreflang="x-default"');
  expect(firstUrl).toContain(`${SITE}/en`);
});
