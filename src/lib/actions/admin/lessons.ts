"use server";

import { eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { CONTENT_TAG } from "@/lib/revalidate";
import { VOCAB_LEVELS, type VocabLevel } from "@/lib/admin/vocab-levels";
import { assertAdmin } from "@/lib/content/guards";
import { pgErrorCode } from "./pg-errors";

/**
 * Lessons CRUD (SF-5 — spec §6.2). number AUTO = max+1 trong unit (teacher
 * không nghĩ số thứ tự); sortOrder=number (seed convention). Trùng số khi
 * race 2 admin → catch 23505 "duplicateNumber". publish/unpublish có GATE
 * riêng (publish.ts — T3); file này chỉ CRUD meta.
 */

export type LessonActionState =
  | { ok?: boolean; error?: string; lessonNumber?: number }
  | null;

export type LessonMetaInput = {
  titleEn: string;
  titleVi?: string | null;
  vocabLevel: VocabLevel;
};

function parseVocab(raw: string): VocabLevel | null {
  return (VOCAB_LEVELS as readonly string[]).includes(raw)
    ? (raw as VocabLevel)
    : null;
}

export async function createLessonAction(
  unitId: number,
  input: LessonMetaInput,
): Promise<LessonActionState> {
  await assertAdmin();
  if (!input.titleEn.trim()) return { error: "titleRequired" };
  const vocab = parseVocab(input.vocabLevel);
  if (!vocab) return { error: "invalidVocabLevel" };
  try {
    const number = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          max: sql<number>`coalesce(max(${lessons.number}), 0)`.mapWith(Number),
        })
        .from(lessons)
        .where(eq(lessons.unitId, unitId));
      const next = (row?.max ?? 0) + 1;
      await tx.insert(lessons).values({
        unitId,
        number: next,
        titleEn: input.titleEn.trim(),
        titleVi: input.titleVi?.trim() || null,
        vocabLevel: vocab,
        sortOrder: next,
      });
      return next;
    });
    return { ok: true, lessonNumber: number };
  } catch (error) {
    if (pgErrorCode(error) === "23505") return { error: "duplicateNumber" };
    console.error("[createLessonAction] insert failed:", error);
    throw error;
  }
}

export async function updateLessonMetaAction(
  lessonId: number,
  input: LessonMetaInput,
): Promise<LessonActionState> {
  await assertAdmin();
  if (!input.titleEn.trim()) return { error: "titleRequired" };
  const vocab = parseVocab(input.vocabLevel);
  if (!vocab) return { error: "invalidVocabLevel" };
  const [row] = await db
    .update(lessons)
    .set({
      titleEn: input.titleEn.trim(),
      titleVi: input.titleVi?.trim() || null,
      vocabLevel: vocab,
    })
    .where(eq(lessons.id, lessonId))
    .returning({ published: lessons.published });
  // Meta đổi trên bài đã publish → public stale (revalidate matrix spec §5);
  // draft không vào public nên bỏ qua
  if (row?.published) revalidateTag(CONTENT_TAG);
  return { ok: true };
}

export async function deleteLessonAction(lessonId: number): Promise<LessonActionState> {
  await assertAdmin();
  try {
    // cascade lessons→parts; attempts RESTRICT → 23503 nếu part đã có người học
    await db.delete(lessons).where(eq(lessons.id, lessonId));
  } catch (error) {
    if (pgErrorCode(error) === "23503") return { error: "hasAttempts" };
    console.error("[deleteLessonAction] delete failed:", error);
    throw error;
  }
  return { ok: true };
}
