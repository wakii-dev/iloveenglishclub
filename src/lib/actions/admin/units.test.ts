import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Units actions — validation + revalidate contract (SF-4 QA, slice 4).
 * Mock pattern theo delete-revalidate.test.ts (vi.hoisted + vi.mock).
 *
 * RED→GREEN (QA-302): createUnitAction/updateUnitAction là mutation trên public
 * content (getBook/getUnits đếm TẤT CẢ units — kể cả draft-only, title render
 * trên public unit page) nhưng KHÔNG revalidateTag — public stale tới 300s,
 * vi phạm revalidate matrix spec §5 ("public stale ngay lúc write"). Fix:
 * revalidateTag(CONTENT_TAG) unconditional sau mutation thành công (precedent
 * deleteUnitAction).
 */
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));
vi.mock("@/lib/queries", () => ({
  getProfile: vi.fn(async () => ({ role: "admin" })),
}));

const dbState = vi.hoisted(() => ({ failWith: null as unknown }));
vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: async () => {
        if (dbState.failWith) throw dbState.failWith;
        return [];
      },
    }),
    update: () => ({
      set: () => ({
        where: async () => {
          if (dbState.failWith) throw dbState.failWith;
          return [];
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        if (dbState.failWith) throw dbState.failWith;
        return [];
      },
    }),
  },
}));

import { CONTENT_TAG } from "@/lib/revalidate";
import {
  createUnitAction,
  deleteUnitAction,
  updateUnitAction,
} from "./units";

afterEach(() => {
  revalidateTag.mockClear();
  dbState.failWith = null;
});

describe("createUnitAction validation", () => {
  it.each([0, -1, 1.5, Number.NaN])("number %s → invalidNumber (không insert)", async (n) => {
    const res = await createUnitAction(1, { number: n, titleEn: "X" });
    expect(res).toEqual({ error: "invalidNumber" });
  });

  it("title rỗng → titleRequired", async () => {
    const res = await createUnitAction(1, { number: 5, titleEn: "   " });
    expect(res).toEqual({ error: "titleRequired" });
  });

  it("23505 → duplicateNumber (không crash)", async () => {
    dbState.failWith = { code: "23505" };
    const res = await createUnitAction(1, { number: 5, titleEn: "X" });
    expect(res).toEqual({ error: "duplicateNumber" });
  });

  it("lỗi lạ → rethrow (không nuốt)", async () => {
    dbState.failWith = new Error("boom");
    await expect(createUnitAction(1, { number: 5, titleEn: "X" })).rejects.toThrow("boom");
  });
});

describe("revalidate contract (QA-302 — RED trước fix)", () => {
  it("createUnit thành công → revalidateTag('content') (public book/units list đếm tất cả units)", async () => {
    const res = await createUnitAction(1, { number: 5, titleEn: "X" });
    expect(res).toEqual({ ok: true });
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(CONTENT_TAG);
  });

  it("updateUnit thành công → revalidateTag('content') (title render trên public unit page)", async () => {
    const res = await updateUnitAction(1, { titleEn: "New title" });
    expect(res).toEqual({ ok: true });
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(CONTENT_TAG);
  });

  it("updateUnit title rỗng → titleRequired, KHÔNG revalidate (không có mutation)", async () => {
    const res = await updateUnitAction(1, { titleEn: "" });
    expect(res).toEqual({ error: "titleRequired" });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("createUnit duplicate → KHÔNG revalidate (insert không thành công)", async () => {
    dbState.failWith = { code: "23505" };
    await createUnitAction(1, { number: 5, titleEn: "X" });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("deleteUnit giữ nguyên contract: revalidate đúng 1 lần (regression)", async () => {
    const res = await deleteUnitAction(1);
    expect(res).toEqual({ ok: true });
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(CONTENT_TAG);
  });
});
