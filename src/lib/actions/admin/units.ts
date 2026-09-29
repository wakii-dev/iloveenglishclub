"use server";

import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { units } from "@/db/schema";
import { CONTENT_TAG } from "@/lib/revalidate";
import { assertAdmin } from "@/lib/content/guards";
import { pgErrorCode } from "./pg-errors";

/**
 * Units CRUD (SF-5 — spec §6.1). Mọi action assertAdmin lại ở server (không
 * tin middleware). number nhập tay theo mục lục sách, unique(bookId,number)
 * → trùng trả error key "duplicateNumber" (client map qua admin.json).
 * KHÔNG cho sửa number sau tạo: audio path `audio/{book}/unit-{n}/...`
 * neo vào number — renumber làm path mới lệch file cũ (giới hạn v1, ghi UI).
 */

export type UnitActionState = { ok?: boolean; error?: string } | null;

export type UnitInput = {
  number: number;
  titleEn: string;
  titleVi?: string | null;
  descEn?: string | null;
  descVi?: string | null;
};

export async function createUnitAction(
  bookId: number,
  input: UnitInput,
): Promise<UnitActionState> {
  await assertAdmin();
  if (!Number.isInteger(input.number) || input.number < 1) {
    return { error: "invalidNumber" };
  }
  if (!input.titleEn.trim()) return { error: "titleRequired" };
  try {
    await db.insert(units).values({
      bookId,
      number: input.number,
      titleEn: input.titleEn.trim(),
      titleVi: input.titleVi?.trim() || null,
      descEn: input.descEn?.trim() || null,
      descVi: input.descVi?.trim() || null,
      sortOrder: input.number,
    });
  } catch (error) {
    if (pgErrorCode(error) === "23505") return { error: "duplicateNumber" };
    console.error("[createUnitAction] insert failed:", error);
    throw error;
  }
  // revalidate matrix (QA-302): getBook/getUnits public đếm TẤT CẢ units (kể cả
  // draft-only) — unit mới đổi unitCount book page NGAY, stale tới 300s nếu thiếu
  revalidateTag(CONTENT_TAG);
  return { ok: true };
}

export async function updateUnitAction(
  unitId: number,
  input: Pick<UnitInput, "titleEn" | "titleVi" | "descEn" | "descVi">,
): Promise<UnitActionState> {
  await assertAdmin();
  if (!input.titleEn.trim()) return { error: "titleRequired" };
  await db
    .update(units)
    .set({
      titleEn: input.titleEn.trim(),
      titleVi: input.titleVi?.trim() || null,
      descEn: input.descEn?.trim() || null,
      descVi: input.descVi?.trim() || null,
    })
    .where(eq(units.id, unitId));
  // revalidate matrix (QA-302): title/desc unit render trên public unit page +
  // units list — mutation xong public phải fresh (deleteUnit cùng precedent)
  revalidateTag(CONTENT_TAG);
  return { ok: true };
}

export async function deleteUnitAction(unitId: number): Promise<UnitActionState> {
  await assertAdmin();
  try {
    // cascade units→lessons→parts (schema); attempts RESTRICT part → nếu đã
    // có người học, delete nổ 23503 → trả "hasAttempts" (unpublish thay vì xóa)
    await db.delete(units).where(eq(units.id, unitId));
  } catch (error) {
    if (pgErrorCode(error) === "23503") return { error: "hasAttempts" };
    console.error("[deleteUnitAction] delete failed:", error);
    throw error;
  }
  // revalidate matrix (spec §5): cascade xóa lessons/parts — public stale ngay
  revalidateTag(CONTENT_TAG);
  return { ok: true };
}
