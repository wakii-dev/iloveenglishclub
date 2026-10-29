/**
 * Auth seam SF2 (ilec-v2, server-side) — thay `auth()` của ilec (next-auth là
 * SF3+). SF2 luôn trả null ⟹ mọi server action chạy đúng NHÁNH GUEST của
 * ilec: submit-attempt → unauthorized, relaxed-mode → không persist,
 * my-stats → null. Client-side dictation chỉ gọi các action này khi đã có
 * user, nên SF2 chúng là đường no-op an toàn với contract giữ nguyên.
 *
 * SF3: đổi body sang `auth()` thật — action không phải sửa.
 */
export async function getCurrentUserId(): Promise<string | null> {
  return null;
}
