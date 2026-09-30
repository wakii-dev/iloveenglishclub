import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Lessons actions — logic contract (SF-4 QA slice 5, plan-critic P0 amend):
 * - race duplicate 23505 → duplicateNumber (2 admin tạo đồng thời max+1 —
 *   transaction không chặn race, catch là lưới cuối);
 * - delete 23503 → hasAttempts (RESTRICT attempts);
 * - publish gate: thiếu audio → publishBlocked + missing[] ĐÚNG số part;
 * - revalidate chỉ khi published (meta/publish/unpublish).
 * Mock pattern theo delete-revalidate.test.ts.
 */
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "admin-1" } })),
}));
vi.mock("@/lib/queries", () => ({
  getProfile: vi.fn(async () => ({ role: "admin" })),
}));

const dbState = vi.hoisted(() => ({
  failWith: null as unknown,
  selectRows: [] as unknown[],
  updateReturning: [] as unknown[],
}));
vi.mock("@/db", () => {
  // publishLessonAction await where() thẳng; createLessonAction (trong tx) gọi
  // .limit() — 2 shape cùng mock cho gọn
  const whereResult = () => {
    const p = Promise.resolve(dbState.selectRows) as Promise<unknown[]> & {
      limit: () => Promise<unknown[]>;
    };
    p.limit = async () => dbState.selectRows;
    return p;
  };
  const makeTx = () => ({
    select: () => ({ from: () => ({ where: whereResult }) }),
    insert: () => ({
      values: async () => {
        if (dbState.failWith) throw dbState.failWith;
        return [];
      },
    }),
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => dbState.updateReturning }) }),
    }),
    delete: () => ({
      where: async () => {
        if (dbState.failWith) throw dbState.failWith;
        return [];
      },
    }),
  });
  return {
    db: Object.assign(makeTx(), {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()),
    }),
  };
});

import { CONTENT_TAG } from "@/lib/revalidate";
import {
  createLessonAction,
  deleteLessonAction,
  publishLessonAction,
  unpublishLessonAction,
  updateLessonMetaAction,
} from "./lessons";

afterEach(() => {
  revalidateTag.mockClear();
  dbState.failWith = null;
  dbState.updateReturning = [];
  dbState.selectRows = [];
});

describe("createLessonAction", () => {
  it("23505 → duplicateNumber (race 2 admin max+1 — catch là lưới cuối)", async () => {
    dbState.failWith = { code: "23505" };
    const res = await createLessonAction(1, {
      titleEn: "X",
      vocabLevel: "A2",
    });
    expect(res).toEqual({ error: "duplicateNumber" });
  });

  it("title rỗng → titleRequired; vocab lạ → invalidVocabLevel (runtime enum)", async () => {
    expect(
      await createLessonAction(1, { titleEn: "  ", vocabLevel: "A2" }),
    ).toEqual({ error: "titleRequired" });
    expect(
      await createLessonAction(1, {
        titleEn: "X",
        vocabLevel: "SUPER" as "A1",
      }),
    ).toEqual({ error: "invalidVocabLevel" });
  });
});

describe("deleteLessonAction", () => {
  it("23503 → hasAttempts (RESTRICT — không mất attempt học viên)", async () => {
    dbState.failWith = { code: "23503" };
    const res = await deleteLessonAction(1);
    expect(res).toEqual({ error: "hasAttempts" });
  });

  it("23001 → hasAttempts (QA-501 — PG17+ raise restrict_violation thay 23503)", async () => {
    dbState.failWith = { code: "23001" };
    const res = await deleteLessonAction(1);
    expect(res).toEqual({ error: "hasAttempts" });
  });

  it("thành công → revalidateTag('content') đúng 1 lần (unconditional — matrix §5)", async () => {
    const res = await deleteLessonAction(1);
    expect(res).toEqual({ ok: true });
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(CONTENT_TAG);
  });
});

describe("publishLessonAction gate", () => {
  it("0 part → publishBlocked missing=[0]", async () => {
    dbState.selectRows = [];
    const res = await publishLessonAction(1);
    expect(res).toEqual({ error: "publishBlocked", missing: [0] });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("part thiếu audio → publishBlocked missing đúng số part", async () => {
    dbState.selectRows = [
      { sortOrder: 1, text: "A", audioPath: "audio/x.mp3" },
      { sortOrder: 2, text: "B", audioPath: null },
      { sortOrder: 3, text: "  ", audioPath: "audio/y.mp3" },
    ];
    const res = await publishLessonAction(1);
    expect(res).toEqual({ error: "publishBlocked", missing: [2, 3] });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("đủ điều kiện → published + revalidate đúng 1 lần", async () => {
    dbState.selectRows = [
      { sortOrder: 1, text: "A", audioPath: "audio/x.mp3" },
    ];
    const res = await publishLessonAction(1);
    expect(res).toEqual({ ok: true });
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(CONTENT_TAG);
  });
});

describe("unpublishLessonAction", () => {
  it("luôn revalidate (unpublish là mutation public)", async () => {
    const res = await unpublishLessonAction(1);
    expect(res).toEqual({ ok: true });
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(CONTENT_TAG);
  });
});

describe("updateLessonMetaAction", () => {
  it("lesson published → revalidate (public title stale nếu thiếu)", async () => {
    dbState.updateReturning = [{ published: true }];
    const res = await updateLessonMetaAction(1, {
      titleEn: "New",
      vocabLevel: "A2",
    });
    expect(res).toEqual({ ok: true });
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(CONTENT_TAG);
  });

  it("lesson draft → KHÔNG revalidate (draft không vào public)", async () => {
    dbState.updateReturning = [{ published: false }];
    const res = await updateLessonMetaAction(1, {
      titleEn: "New",
      vocabLevel: "A2",
    });
    expect(res).toEqual({ ok: true });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
