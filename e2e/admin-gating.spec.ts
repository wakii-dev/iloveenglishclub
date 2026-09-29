import { expect, test } from "@playwright/test";
import {
  cleanupQaAccount,
  forgeSessionToken,
  isLocaleRoot,
  loginAs,
  roleOf,
  seedQaUser,
  userIdOf,
} from "./admin-lib";

/**
 * Gating 2 lớp (spec slice 2 — ACCEPTANCE 1):
 * - Lớp 1 middleware (edge, JWT presence): guest → login redirect; API /api/admin
 *   không qua middleware (matcher loại /api) → route assertAdmin tự 401/403.
 * - Lớp 2 layout (Node, DB re-check): JWT hợp lệ CHỨ KHÔNG đủ — role phải `admin`
 *   trong profiles tại thời điểm request. Learner (role user) → redirect "/";
 *   forged JWT role=admin (chữ ký đúng, role claim giả) → VẪN bị lớp 2 chặn.
 *
 * assertAdmin là guard DUY NHẤT của actions/route — 17 call sites (baseline grep).
 * Fixture learner `e2e-learner@example.com` READ-ONLY — guard đầu spec chống
 * contamination chéo run (role phải vẫn `user`).
 */

const LEARNER = "e2e-learner@example.com";
const LEARNER_PASS = "e2e-learner-pass";

test.describe("Admin gating 2 lớp (SF-4)", () => {
  test("guard: fixture learner vẫn role user (chống contamination chéo run)", async () => {
    expect(await roleOf(LEARNER)).toBe("user");
  });

  test("lớp 1: guest /admin → redirect login; POST upload → 401", async ({
    page,
    request,
  }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);

    const guest = await request.post("/api/admin/upload", {
      multipart: {
        file: {
          name: "01.mp3",
          mimeType: "audio/mpeg",
          buffer: Buffer.from("x"),
        },
        lessonId: "1",
        partIndex: "1",
      },
    });
    expect(guest.status()).toBe(401);
  });

  test("lớp 2: learner đăng nhập → /admin bị layout redirect về trang chủ; POST upload → 403", async ({
    page,
  }) => {
    await loginAs(page, LEARNER, LEARNER_PASS);

    // JWT hợp lệ (đăng nhập thật) → middleware cho qua; layout re-check DB chặn
    await page.goto("/admin");
    await expect(page).toHaveURL((u) => isLocaleRoot(u.pathname));

    const res = await page.request.post("/api/admin/upload", {
      multipart: {
        file: { name: "01.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("x") },
        lessonId: "1",
        partIndex: "1",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("forged JWT role=admin (chữ ký đúng) → middleware cho qua, lớp 2 DB chặn", async ({
    request,
  }) => {
    const learnerId = await userIdOf(LEARNER);
    expect(learnerId).toBeTruthy();
    const token = await forgeSessionToken({
      sub: learnerId!,
      role: "admin",
      email: LEARNER,
      name: "E2E Learner",
    });

    const forged = await request.get("/admin", {
      headers: { cookie: `authjs.session-token=${token}` },
      maxRedirects: 0, // tự thấy redirect thay vì theo tới đích
    });
    expect(forged.status()).toBeGreaterThanOrEqual(300);
    expect(forged.status()).toBeLessThan(400);
    expect(forged.headers().location ?? "/").toMatch(/^\/?($|\?|en|vi)/);
  });

  test("forged JWT sub=user KHÔNG TỒN TẠI → getProfile null → vẫn chặn (không 500)", async ({
    request,
  }) => {
    const token = await forgeSessionToken({
      sub: "00000000-0000-4000-8000-00000000dead",
      role: "admin",
      email: "ghost@forged.test",
    });
    const res = await request.get("/admin", {
      headers: { cookie: `authjs.session-token=${token}` },
      maxRedirects: 0,
    });
    // redirect về trang chủ (lớp 2 chặn) — không crash, không vào /admin
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
  });

  test("admin thật vẫn vào được /admin (control — gate không quá tay)", async ({
    page,
  }) => {
    await loginAs(page, process.env.ADMIN_EMAIL ?? "admin@ilec.dev", process.env.ADMIN_PASSWORD ?? "");
    await page.goto("/admin");
    await expect(page).toHaveURL((u) => u.pathname === "/admin");
    await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  });
});

test.describe("Users slice fixtures (sf4-user)", () => {
  const QA_EMAIL = "sf4-roler@test.ilec";

  test.afterAll(async () => {
    await cleanupQaAccount(QA_EMAIL);
  });

  test("seedQaUser tạo account chuyên dụng role user (users slice dùng)", async () => {
    const id = await seedQaUser(QA_EMAIL, "SF4 Role User");
    expect(id).toBeTruthy();
    expect(await roleOf(QA_EMAIL)).toBe("user");
  });
});
