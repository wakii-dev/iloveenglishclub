"use server";

import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { db } from "@/db";
import { attempts, lessonParts, lessons } from "@/db/schema";
import { CONTENT_TAG } from "@/lib/revalidate";
import { splitSentences } from "@/lib/content/split-sentences";
import {
  MAX_SENTENCES_PER_BATCH,
  sanitizeSentences,
} from "@/lib/admin/parts-logic";
import { assertAdmin } from "@/lib/content/guards";
import { pgErrorCode } from "./pg-errors";

/**
 * Parts mutations (SF-5 — spec §3). Invariant sortOrder LIÊN TỤC 1..N (P0
 * spec-critic): mọi op giữ invariant qua primitive shift bump-offset —
 * unique(lesson_id,sort_order) NOT deferrable nên không shift trực tiếp được
 * (Postgres check per-row → transient dup 23505). +1000 tách 2 vùng: mọi
 * statement thấy "low distinct ∧ high distinct ∧ không giao nhau" bất kể thứ
 * tự row. An toàn khi lesson < ~1000 parts (cap 200/batch ở parts-logic).
 */

export type PartActionState = { ok?: boolean; error?: string } | null;

/** Shift sortOrder của các part chỉ định bởi delta — 3 statement an toàn. */
async function shiftByIds(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ids: number[],
  delta: number,
): Promise<void> {
  if (ids.length === 0) return;
  const scope = inArray(lessonParts.id, ids);
  await tx
    .update(lessonParts)
    .set({ sortOrder: sql`${lessonParts.sortOrder} + 1000` })
    .where(scope);
  await tx
    .update(lessonParts)
    .set({ sortOrder: sql`${lessonParts.sortOrder} + ${delta}` })
    .where(scope);
  await tx
    .update(lessonParts)
    .set({ sortOrder: sql`${lessonParts.sortOrder} - 1000` })
    .where(scope);
}

/** revalidate content khi lesson đã publish (revalidate matrix — spec §5). */
async function revalidateIfPublished(lessonId: number): Promise<void> {
  const [row] = await db
    .select({ published: lessons.published })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (row?.published) revalidateTag(CONTENT_TAG);
}

export async function addPartsFromScriptAction(
  lessonId: number,
  rawSentences: string[],
): Promise<PartActionState> {
  await assertAdmin();
  const { sentences } = sanitizeSentences(rawSentences);
  if (sentences.length === 0) return { error: "noSentences" };
  if (sentences.length > MAX_SENTENCES_PER_BATCH) {
    return { error: "tooManySentences" };
  }
  const txResult = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        max: sql<number>`coalesce(max(${lessonParts.sortOrder}), 0)`.mapWith(Number),
      })
      .from(lessonParts)
      .where(eq(lessonParts.lessonId, lessonId));
    const start = (row?.max ?? 0) + 1;
    // cap TỔNG part/lesson ≤ 999 (review P2): shift bump-offset +1000 chỉ
    // an toàn trong vùng < 1000 — comment parts-logic giờ được enforce thật
    if (start - 1 + sentences.length > 999) {
      return { error: "tooManyParts" } as const;
    }
    await tx.insert(lessonParts).values(
      sentences.map((text, i) => ({
        lessonId,
        sortOrder: start + i,
        text,
      })),
    );
    return { ok: true } as const;
  });
  if ("error" in txResult) return txResult;
  await revalidateIfPublished(lessonId);
  return { ok: true };
}

export async function updatePartTextAction(
  partId: number,
  text: string,
): Promise<PartActionState> {
  await assertAdmin();
  const trimmed = text.trim();
  if (!trimmed) return { error: "partTextRequired" };
  const [part] = await db
    .select({ lessonId: lessonParts.lessonId })
    .from(lessonParts)
    .where(eq(lessonParts.id, partId))
    .limit(1);
  if (!part) return { error: "notFound" };
  await db
    .update(lessonParts)
    .set({ text: trimmed })
    .where(eq(lessonParts.id, partId));
  await revalidateIfPublished(part.lessonId);
  return { ok: true };
}

export async function movePartAction(
  partId: number,
  dir: "up" | "down",
): Promise<PartActionState> {
  await assertAdmin();
  const [part] = await db
    .select()
    .from(lessonParts)
    .where(eq(lessonParts.id, partId))
    .limit(1);
  if (!part) return { error: "notFound" };
  const neighbor = part.sortOrder + (dir === "up" ? -1 : 1);
  const [other] = await db
    .select({ id: lessonParts.id })
    .from(lessonParts)
    .where(
      and(
        eq(lessonParts.lessonId, part.lessonId),
        eq(lessonParts.sortOrder, neighbor),
      ),
    )
    .limit(1);
  if (!other) return { ok: true }; // đầu/cuối danh sách — không có gì để đổi
  await db.transaction(async (tx) => {
    // Swap 2 hàng (fix 23505 2026-09-29: bản cũ set part = neighbor+1000 —
    // TRÙNG giá trị bump +1000 của neighbor → duplicate key mọi hướng).
    // Chuẩn 3 bước: (1) neighbor rời chỗ lên vùng cao, (2) part trượt vào
    // chỗ trống, (3) neighbor xuống chỗ part vừa bỏ trống. Mỗi statement
    // thấy giá trị distinct riêng.
    await tx
      .update(lessonParts)
      .set({ sortOrder: sql`${lessonParts.sortOrder} + 1000` })
      .where(eq(lessonParts.id, other.id));
    await tx
      .update(lessonParts)
      .set({ sortOrder: neighbor })
      .where(eq(lessonParts.id, part.id));
    await tx
      .update(lessonParts)
      .set({ sortOrder: part.sortOrder })
      .where(eq(lessonParts.id, other.id));
  });
  await revalidateIfPublished(part.lessonId);
  return { ok: true };
}

/**
 * Tách 1 part thành k câu (splitSentences SF-3): shift phần sau +(k−1) rồi
 * update text part hiện tại = piece[0] + insert k−1 part. <2 pieces → no-op
 * error (câu đơn không tách được).
 */
export async function splitPartAction(
  partId: number,
): Promise<PartActionState> {
  await assertAdmin();
  const [part] = await db
    .select()
    .from(lessonParts)
    .where(eq(lessonParts.id, partId))
    .limit(1);
  if (!part) return { error: "notFound" };
  const pieces = splitSentences(part.text);
  if (pieces.length < 2) return { error: "cannotSplit" };
  const n = part.sortOrder;
  const k = pieces.length;
  const followers = await db
    .select({ id: lessonParts.id })
    .from(lessonParts)
    .where(
      and(
        eq(lessonParts.lessonId, part.lessonId),
        gt(lessonParts.sortOrder, n),
      ),
    );
  await db.transaction(async (tx) => {
    await shiftByIds(
      tx,
      followers.map((f) => f.id),
      k - 1,
    );
    await tx
      .update(lessonParts)
      .set({ text: pieces[0]! })
      .where(eq(lessonParts.id, part.id));
    await tx.insert(lessonParts).values(
      pieces.slice(1).map((text, i) => ({
        lessonId: part.lessonId,
        sortOrder: n + 1 + i,
        text,
      })),
    );
  });
  await revalidateIfPublished(part.lessonId);
  return { ok: true };
}

/** Gộp part hiện tại với part DƯỚI: text join " ", xóa dưới, shift kín lỗ. */
export async function mergePartDownAction(
  partId: number,
): Promise<PartActionState> {
  await assertAdmin();
  const [part] = await db
    .select()
    .from(lessonParts)
    .where(eq(lessonParts.id, partId))
    .limit(1);
  if (!part) return { error: "notFound" };
  const [next] = await db
    .select()
    .from(lessonParts)
    .where(
      and(
        eq(lessonParts.lessonId, part.lessonId),
        eq(lessonParts.sortOrder, part.sortOrder + 1),
      ),
    )
    .limit(1);
  if (!next) return { error: "cannotMerge" };
  const followers = await db
    .select({ id: lessonParts.id })
    .from(lessonParts)
    .where(
      and(
        eq(lessonParts.lessonId, part.lessonId),
        gt(lessonParts.sortOrder, next.sortOrder),
      ),
    );
  await db.transaction(async (tx) => {
    await tx
      .update(lessonParts)
      .set({ text: `${part.text} ${next.text}`.trim() })
      .where(eq(lessonParts.id, part.id));
    await tx.delete(lessonParts).where(eq(lessonParts.id, next.id));
    await shiftByIds(
      tx,
      followers.map((f) => f.id),
      -1,
    );
  });
  await revalidateIfPublished(part.lessonId);
  return { ok: true };
}

/** Thêm 1 dòng trống SAU part (chỗ dán câu tay — câu không kết .?!). */
export async function insertEmptyPartAction(
  partId: number,
): Promise<PartActionState> {
  await assertAdmin();
  const [part] = await db
    .select()
    .from(lessonParts)
    .where(eq(lessonParts.id, partId))
    .limit(1);
  if (!part) return { error: "notFound" };
  const followers = await db
    .select({ id: lessonParts.id })
    .from(lessonParts)
    .where(
      and(
        eq(lessonParts.lessonId, part.lessonId),
        gt(lessonParts.sortOrder, part.sortOrder),
      ),
    );
  await db.transaction(async (tx) => {
    await shiftByIds(
      tx,
      followers.map((f) => f.id),
      1,
    );
    await tx.insert(lessonParts).values({
      lessonId: part.lessonId,
      sortOrder: part.sortOrder + 1,
      text: "",
    });
  });
  await revalidateIfPublished(part.lessonId);
  return { ok: true };
}

/**
 * Xóa part (SF-5): CHẶN khi có attempts (DB RESTRICT — UI disable + server
 * double-check bằng count trước; 23503 là lưới cuối). Xóa xong shift kín lỗ.
 */
export async function deletePartAction(
  partId: number,
): Promise<PartActionState> {
  await assertAdmin();
  const [part] = await db
    .select()
    .from(lessonParts)
    .where(eq(lessonParts.id, partId))
    .limit(1);
  if (!part) return { error: "notFound" };
  const [attemptRow] = await db
    .select({ total: count() })
    .from(attempts)
    .where(eq(attempts.partId, partId));
  if ((attemptRow?.total ?? 0) > 0) return { error: "hasAttempts" };
  const followers = await db
    .select({ id: lessonParts.id })
    .from(lessonParts)
    .where(
      and(
        eq(lessonParts.lessonId, part.lessonId),
        gt(lessonParts.sortOrder, part.sortOrder),
      ),
    );
  try {
    await db.transaction(async (tx) => {
      await tx.delete(lessonParts).where(eq(lessonParts.id, part.id));
      await shiftByIds(
        tx,
        followers.map((f) => f.id),
        -1,
      );
    });
  } catch (error) {
    // TOCTOU (review P2): attempt chen giữa count và delete → FK RESTRICT nổ
    // tại đây — trả "hasAttempts" thay vì raw 500
    if (pgErrorCode(error) === "23503") return { error: "hasAttempts" };
    throw error;
  }
  await revalidateIfPublished(part.lessonId);
  return { ok: true };
}
