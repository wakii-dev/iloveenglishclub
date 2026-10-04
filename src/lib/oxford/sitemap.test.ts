import { describe, expect, it } from "vitest";
import { fetchSlugs } from "./sitemap";

// Excerpt sitemap thật (fetch 2026-10-04): index có english + american_english
// + sitemapfree; sub-sitemap = urlset <loc> các URL /definition/english/<slug>.
const INDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
   <sitemap><loc>https://www.oxfordlearnersdictionaries.com/sitemap/sitemapfree.xml</loc></sitemap>
   <sitemap><loc>https://www.oxfordlearnersdictionaries.com/sitemap/english/sitemap1.xml</loc></sitemap>
   <sitemap><loc>https://www.oxfordlearnersdictionaries.com/sitemap/english/sitemap2.xml</loc></sitemap>
   <sitemap><loc>https://www.oxfordlearnersdictionaries.com/sitemap/american_english/sitemap1.xml</loc></sitemap>
</sitemapindex>`;

const SUB1_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.oxfordlearnersdictionaries.com/definition/english/tree</loc></url>
  <url><loc>https://www.oxfordlearnersdictionaries.com/definition/english/three-d_2</loc></url>
  <url><loc>https://www.oxfordlearnersdictionaries.com/definition/academic/apology</loc></url>
  <url><loc>https://www.oxfordlearnersdictionaries.com/definition/english/collocations-ish</loc></url>
  <url><loc>https://www.oxfordlearnersdictionaries.com/browse/english/a</loc></url>
</urlset>`;

const SUB2_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.oxfordlearnersdictionaries.com/definition/english/color_1</loc></url>
</urlset>`;

const ROBOTS_TEXT = `User-agent: *
Disallow: /definition/academic/
Disallow: /definition/collocations/
`;

function fakeFetchXml(): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.endsWith("/robots.txt")) return new Response(ROBOTS_TEXT);
    if (u.endsWith("/sitemap.xml")) return new Response(INDEX_XML);
    if (u.endsWith("sitemap1.xml")) return new Response(SUB1_XML);
    if (u.endsWith("sitemap2.xml")) return new Response(SUB2_XML);
    return new Response("", { status: 404 });
  }) as typeof fetch;
}

describe("fetchSlugs — index → english sub-sitemaps → slugs", () => {
  it("chỉ lấy /sitemap/english/*, bỏ sitemapfree + american_english", async () => {
    const urls: string[] = [];
    const fetchSpy = (async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return fakeFetchXml()(url);
    }) as typeof fetch;
    const slugs = await fetchSlugs({ fetchImpl: fetchSpy });
    expect(urls.filter((u) => u.includes("sitemap"))).toEqual([
      "https://www.oxfordlearnersdictionaries.com/sitemap.xml",
      "https://www.oxfordlearnersdictionaries.com/sitemap/english/sitemap1.xml",
      "https://www.oxfordlearnersdictionaries.com/sitemap/english/sitemap2.xml",
    ]);
    expect(slugs).toContain("tree");
    expect(slugs).toContain("color_1");
  });

  it("lọc /definition/english/* + robots Disallow (academic), giữ slug khác", async () => {
    const slugs = await fetchSlugs({ fetchImpl: fakeFetchXml() });
    expect(slugs).toContain("three-d_2");
    expect(slugs).toContain("collocations-ish"); // slug CHỨA chữ nhưng path hợp lệ
    expect(slugs).not.toContain("apology"); // /definition/academic/ bị Disallow
    expect(slugs).toHaveLength(4); // tree, three-d_2, collocations-ish, color_1
  });

  it("slug dedup giữa 2 sub-sitemap", async () => {
    const slugs = await fetchSlugs({ fetchImpl: fakeFetchXml() });
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("maxSitemaps=1 → chỉ sub 1", async () => {
    const slugs = await fetchSlugs({ fetchImpl: fakeFetchXml(), maxSitemaps: 1 });
    expect(slugs).toContain("tree");
    expect(slugs).not.toContain("color_1");
  });

  // Reviewer nhóm B P1: 500 phải THROW — không [] lặng lẽ (fake enumerate)
  it("index trả 500 → HttpError (không trả [] im lặng)", async () => {
    const err = await fetchSlugs({
      fetchImpl: (async (url: RequestInfo | URL) =>
        String(url).endsWith("/sitemap.xml") ? new Response("", { status: 500 }) : new Response("")
      ) as typeof fetch,
    }).catch((e) => e);
    expect(err.name).toBe("HttpError");
    expect(err.status).toBe(500);
    expect(err.retryable).toBe(true);
  });

  // Reviewer nhóm B P2: sub-sitemap hostname ngoài allowlist bị chặn
  it("sub-sitemap hostname ngoài allowlist → không fetch", async () => {
    const hostileIndex = INDEX_XML.replace(
      "https://www.oxfordlearnersdictionaries.com/sitemap/english/sitemap1.xml",
      "https://evil.com/sitemap/english/sitemap1.xml",
    );
    const fetched: string[] = [];
    await fetchSlugs({
      fetchImpl: (async (url: RequestInfo | URL) => {
        fetched.push(String(url));
        if (String(url).endsWith("/robots.txt")) return new Response(ROBOTS_TEXT);
        if (String(url).endsWith("/sitemap.xml")) return new Response(hostileIndex);
        return new Response("");
      }) as typeof fetch,
    });
    expect(fetched.some((u) => u.includes("evil.com"))).toBe(false);
  });
});
