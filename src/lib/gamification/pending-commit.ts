/**
 * Pending-attempt snapshot (SF-6 §5.8 guest-commit) — sessionStorage mirror
 * của kết quả in-memory guest. Lý do: signIn redirect trả về lesson là FULL
 * page load → module store (Zustand singleton) chết — không có snapshot thì
 * điểm guest mất trắng. Mirror liên tục khi guest; khi user quay lại lesson
 * (bất kỳ leg nào soft/hard), commit-on-mount đọc + pop snapshot rồi submit
 * qua cùng action (attemptIdFor cho cùng uuid → idempotent với unique
 * constraint — không cộng kép).
 *
 * sessionStorage (không localStorage): sống đúng 1 tab phiên học — đóng tab =
 * bỏ, không "hồi sinh" điểm cá lạ.
 */

const KEY = "ilec:pending-attempts";

export interface PendingAttempt {
  partId: number;
  typedText: string;
  usedHint: boolean;
  relaxed: boolean;
}

export function savePendingAttempts(items: PendingAttempt[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage đầy/private mode — commit đường mềm (live check user) vẫn hoạt động
  }
}

/** Đọc + XOÁ snapshot (commit đúng 1 lần; submit fail không hồi sinh — log). */
export function takePendingAttempts(): PendingAttempt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    sessionStorage.removeItem(KEY);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PendingAttempt =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as PendingAttempt).partId === "number" &&
        typeof (p as PendingAttempt).typedText === "string" &&
        typeof (p as PendingAttempt).usedHint === "boolean" &&
        typeof (p as PendingAttempt).relaxed === "boolean",
    );
  } catch {
    return [];
  }
}

/** Peek KHÔNG xoá — dùng quyết định có chủ động refetch session không. */
export function hasPendingAttempts(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}
