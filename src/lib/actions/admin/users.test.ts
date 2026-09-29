import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Users action — runtime validation contract (SF-4 QA slice 10):
 * - role lạ từ crafted payload → invalidRole (TS-only không chặn runtime);
 * - tự đổi role mình → cannotChangeSelf (tránh admin tự hạ mất /admin);
 * - role hợp lệ user khác → update + ok:true.
 * Mock pattern delete-revalidate.test.ts.
 */
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag }));

const authState = vi.hoisted(() => ({ selfId: "admin-1" as string | null }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () =>
    authState.selfId ? { user: { id: authState.selfId } } : null,
  ),
}));
vi.mock("@/lib/queries", () => ({
  getProfile: vi.fn(async (id: string) =>
    id === authState.selfId ? { role: "admin" } : { role: "user" },
  ),
}));

const dbState = vi.hoisted(() => ({ updated: [] as unknown[] }));
vi.mock("@/db", () => ({
  db: {
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          dbState.updated.push(values);
          return [];
        },
      }),
    }),
  },
}));

import { changeUserRoleAction } from "./users";

afterEach(() => {
  dbState.updated = [];
  authState.selfId = "admin-1";
});

describe("changeUserRoleAction", () => {
  it("role lạ (crafted payload) → invalidRole, KHÔNG update DB", async () => {
    const res = await changeUserRoleAction("user-2", "superadmin" as "admin");
    expect(res).toEqual({ error: "invalidRole" });
    expect(dbState.updated).toHaveLength(0);
  });

  it("tự đổi role chính mình → cannotChangeSelf, KHÔNG update DB", async () => {
    const res = await changeUserRoleAction("admin-1", "user");
    expect(res).toEqual({ error: "cannotChangeSelf" });
    expect(dbState.updated).toHaveLength(0);
  });

  it("user khác + role hợp lệ → update với đúng role, ok:true", async () => {
    const res = await changeUserRoleAction("user-2", "admin");
    expect(res).toEqual({ ok: true });
    expect(dbState.updated).toEqual([{ role: "admin" }]);
  });

  it("chưa đăng nhập → assertAdmin NÉM ForbiddenError (không update DB)", async () => {
    authState.selfId = null;
    await expect(changeUserRoleAction("user-2", "admin")).rejects.toThrow(
      "not-authenticated",
    );
    expect(dbState.updated).toHaveLength(0);
  });
});
