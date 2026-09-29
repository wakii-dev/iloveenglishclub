import { afterEach, describe, expect, it, vi } from "vitest";

// Meta-test review P1 (VU-20): delete lesson/unit là mutation trên public
// content — revalidate matrix spec §5 đòi revalidateTag('content') sau delete
// thành công (public unit/book lists stale tối đa 5 phút nếu thiếu).
// Mock pattern theo src/lib/revalidate.test.ts (vi.hoisted + vi.mock).
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));
vi.mock("@/lib/queries", () => ({
  getProfile: vi.fn(async () => ({ role: "admin" })),
}));
vi.mock("@/db", () => ({
  db: { delete: () => ({ where: async () => [] }) },
}));

import { CONTENT_TAG } from "@/lib/revalidate";
import { deleteLessonAction } from "./lessons";
import { deleteUnitAction } from "./units";

describe("delete actions revalidate content (review P1 — matrix spec §5)", () => {
  afterEach(() => {
    revalidateTag.mockClear();
  });

  it("deleteLessonAction thành công → revalidateTag('content') đúng 1 lần", async () => {
    const res = await deleteLessonAction(1);
    expect(res).toEqual({ ok: true });
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(CONTENT_TAG);
  });

  it("deleteUnitAction thành công → revalidateTag('content') đúng 1 lần", async () => {
    const res = await deleteUnitAction(1);
    expect(res).toEqual({ ok: true });
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(CONTENT_TAG);
  });
});
