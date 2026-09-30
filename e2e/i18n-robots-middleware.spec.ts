import { expect, test } from "@playwright/test";

/**
 * E2E robots + middleware matcher (SF-5 QA, context pack #6): robots.txt đúng,
 * /admin bị exclude khỏi next-intl routing (redirect login, KHÔNG /en/admin),
 * KHÔNG lấn route public hay /api/* (api không bị intl rewrite), static
 * metadata routes (/sitemap.xml, /robots.txt) served trực tiếp.
 *
 * Boundary: chỉ verify matcher không lấn — chi tiết gating 2 lớp admin là
 * SF-4 (read-only từ SF-5).
 */

const SITE = "http://localhost:3000";

test("robots.txt: allow all trừ /admin + /api, sitemap absolute", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain("User-Agent: *");
  expect(body).toContain("Allow: /");
  expect(body).toContain("Disallow: /admin");
  expect(body).toContain("Disallow: /api");
  expect(body).toContain(`Sitemap: ${SITE}/sitemap.xml`);
});

test("/admin guest: redirect login kèm ?next= — KHÔNG bị intl nuốt thành /en/admin", async ({
  request,
}) => {
  const res = await request.get("/admin", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  const location = res.headers()["location"] ?? "";
  expect(location).toContain("/en/login");
  expect(location).toContain("next=%2Fadmin");
});

test("/en/admin + /vi/admin: 404 — admin không leak qua locale prefix", async ({ request }) => {
  for (const path of ["/en/admin", "/vi/admin"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(404);
  }
});

test("/api/* không bị intl rewrite (route lạ → 404, không redirect /en/api)", async ({
  request,
}) => {
  const res = await request.get("/api/should-not-exist-xyz", { maxRedirects: 0 });
  expect(res.status()).toBe(404);
  expect(res.headers()["location"] ?? "").not.toContain("/en/api");
});

test("/ redirect về /en (defaultLocale always); /vi/books passthrough 200", async ({
  request,
}) => {
  const root = await request.get("/", { maxRedirects: 0 });
  expect(root.status()).toBe(307);
  expect(root.headers()["location"]).toContain("/en");

  const vi = await request.get("/vi/books", { maxRedirects: 0 });
  expect(vi.status()).toBe(200);
});

test("/sitemap.xml + /robots.txt: middleware không redirect (served trực tiếp)", async ({
  request,
}) => {
  for (const path of ["/sitemap.xml", "/robots.txt"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(200);
    expect(res.headers()["location"] ?? "", `${path} không bị locale-redirect`).toBe("");
  }
});
