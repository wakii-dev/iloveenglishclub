import { expect, test } from "@playwright/test";

/**
 * E2E OG images động (SF-5 QA, context pack #4): render đúng title/locale
 * (không crash, PNG thật — visual đã verify riêng bằng screenshot ngoài e2e).
 *
 * Contract: og:image TRONG META là URL consumers dùng (file-convention có
 * hash suffix ở dev) — assert URL đó resolve 200 image/png. Bare path
 * /opengraph-image 404 ở dev là quirk routing dev (observation, không
 * user-visible). Unknown-locale /api/og → fallback en (code: `=== "vi"`).
 * Prod-domain thật là SF-6 (local chỉ verify code-path).
 */

const BOOK_PATH = "/books/level-3";
const LESSON_PATH = "/books/level-3/units/1/lessons/1/listen-and-type";

async function ogImageFromMeta(
  page: import("@playwright/test").Page,
  path: string,
): Promise<string> {
  const res = await page.request.get(path);
  expect(res.status(), `page ${path} tồn tại`).toBe(200);
  const html = await res.text();
  const match = html.match(/property="og:image" content="([^"]+)"/);
  expect(match, `og:image meta trên ${path}`).toBeTruthy();
  return match![1];
}

test("/api/og: 200 image/png cả en + vi, unknown locale fallback en", async ({ request }) => {
  for (const [query, expectStatus] of [
    ["?locale=en", 200],
    ["?locale=vi", 200],
    ["", 200],
    ["?locale=fr", 200], // whitelisted fallback → en
  ] as const) {
    const res = await request.get(`/api/og${query}`);
    expect(res.status(), `/api/og${query}`).toBe(expectStatus);
    expect(res.headers()["content-type"]).toContain("image/png");
    const body = await res.body();
    expect(body.length, "PNG không rỗng").toBeGreaterThan(10_000);
  }
});

test("/api/og: vi render KHÁC en (locale thực sự đổi nội dung ảnh)", async ({ request }) => {
  const en = await (await request.get("/api/og?locale=en")).body();
  const vi = await (await request.get("/api/og?locale=vi")).body();
  expect(!en.equals(vi), "bytes khác nhau giữa 2 locale").toBe(true);
});

test("book og:image (meta URL): resolve 200 image/png", async ({ page }) => {
  const url = await ogImageFromMeta(page, `/en${BOOK_PATH}`);
  const res = await page.request.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});

test("lesson og:image (meta URL): resolve 200 image/png", async ({ page }) => {
  const url = await ogImageFromMeta(page, `/en${LESSON_PATH}`);
  const res = await page.request.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});

test("home og:image meta trỏ /api/og đúng locale (không placeholder)", async ({ page }) => {
  for (const locale of ["en", "vi"] as const) {
    const url = await ogImageFromMeta(page, `/${locale}`);
    expect(url).toContain(`/api/og?locale=${locale}`);
  }
});
