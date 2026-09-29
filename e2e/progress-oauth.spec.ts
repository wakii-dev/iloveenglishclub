import { expect, test } from "@playwright/test";

/**
 * E2E SF-3 QA (context pack #4 — OAuth Google probe): env KHÔNG có
 * GOOGLE_CLIENT_ID/SECRET (xác nhận SF-1 evidence + .env.local worktree) →
 * googleEnabled=false → src/auth.ts KHÔNG register provider Google, form
 * ẩn nút. Test những gì CÓ thể test khi không có creds; KHÔNG fail mơ hồ —
 * giới hạn ghi findings-sf3.md (QA-201).
 */

test.describe("OAuth Google — googleEnabled=false (env limit)", () => {
  test.setTimeout(120_000);

  test("login + register KHÔNG hiển thị nút Google khi thiếu creds", async ({
    page,
  }) => {
    await page.goto("/en/login", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: /google/i }),
    ).toHaveCount(0);
    await expect(page.getByText(/^or$/i)).toHaveCount(0); // divider cũng ẩn

    await page.goto("/en/register", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: /google/i }),
    ).toHaveCount(0);
  });

  test("/api/auth/providers chỉ có credentials — Google không register", async ({
    request,
  }) => {
    const res = await request.get("/api/auth/providers");
    expect(res.status()).toBe(200);
    const providers = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(providers)).toEqual(["credentials"]);
  });
});
