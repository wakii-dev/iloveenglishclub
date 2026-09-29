/**
 * Pure UI helpers SF-4 — TÁCH KHỎI `src/lib/dictation/` (sở hữu SF-3, read-only).
 * Zero I/O, zero DOM — dùng được trong component lẫn Vitest node-env.
 * Nguồn số: design hand-off §1.9 (waveform 28 bar, ring 326.7) + epic §5.5 (XP max 10/part).
 */

export const WAVEFORM_BARS = 28;
export const RING_CIRCUMFERENCE = 326.7; // 2π × r(52) — design §2.2 AccuracyRing

/** Giây → `m:ss` (làm tròn xuống); âm/NaN → `0:00`. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Seek ±3s clamp [0, duration]; duration ≤ 0 → 0 (chưa biết độ dài). */
export function clampSeek(nextMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.min(Math.max(nextMs, 0), durationMs);
}

/** Số bar waveform đã phát = round(elapsed/duration × 28), clamp [0, 28]. */
export function waveformFillCount(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  const ratio = elapsedMs / durationMs;
  return Math.min(WAVEFORM_BARS, Math.max(0, Math.round(ratio * WAVEFORM_BARS)));
}

export interface LessonFacts {
  sentences: number;
  totalAudioMs: number;
  minutesEstimate: number;
  xpMax: number;
}

/**
 * FactPills Start-gate (spec §3.1): n câu · tổng audio · ~phút (30s/câu
 * heuristic — prototype 4 câu → ~2 minutes) · XP max 10/part (epic §5.5).
 */
export function lessonFacts(
  parts: readonly { durationMs: number | null }[],
): LessonFacts {
  const sentences = parts.length;
  const totalAudioMs = parts.reduce((sum, p) => sum + (p.durationMs ?? 0), 0);
  return {
    sentences,
    totalAudioMs,
    minutesEstimate: Math.ceil(sentences / 2),
    xpMax: sentences * 10,
  };
}

/** AccuracyRing dasharray (design §2.2): `pct×326.7` cách "327", clamp [0,1]. */
export function accuracyRingDash(pct: number): string {
  const clamped = Math.min(1, Math.max(0, pct));
  const dash = Number.isFinite(clamped * RING_CIRCUMFERENCE)
    ? String(Math.round(clamped * RING_CIRCUMFERENCE * 10) / 10)
    : "0";
  return `${dash} 327`;
}
