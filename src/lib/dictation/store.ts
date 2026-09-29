/**
 * Player store Zustand VANILLA — state machine §5.4 (epic spec, chốt cứng).
 *
 * - Factory `createDictationStore()`: test tạo instance mới mỗi lần (node-env,
 *   KHÔNG DOM — spec §3.3); singleton `dictationStore` + hook wrapper
 *   `useDictationStore` cho SF-4.
 * - KHÔNG persist, KHÔNG middleware — persist attempts/XP là việc SF-6.
 * - Audio chỉ là INTENT (`isPlaying`, `seekRequest`): SF-4 sync <audio> element
 *   qua effect theo nonce — module này KHÔNG đụng audio (boundary context pack).
 *
 * Guard keywords (spec §3.2): ACTIVE = phase ∈ {playing,input,checked};
 * PENDING-PART = part hiện tại status "pending"; part RESOLVED (done/skipped)
 * ĐÓNG BĂNG — check/hint/skip/setInput no-op (xem lại = read-only).
 */
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import {
  computeAccuracy,
  computeXp,
  diffWords,
  type CompareMode,
  type DiffResult,
} from "./diff";

export type DictationPhase =
  | "idle"
  | "start-gate"
  | "playing"
  | "input"
  | "checked"
  | "complete";

export type PartStatus = "pending" | "done" | "skipped";

export interface PartState {
  index: number;
  transcript: string;
  status: PartStatus;
  attempts: number;
  usedHint: boolean;
  xpEarned: number;
  /** accuracy của attempt ĐẦU (bank lúc check đầu) — dùng cho accuracy TB
   *  màn kết quả (§5.7): part done luôn allCorrect nên acc attempt-sau vô nghĩa. */
  firstAccuracy: number | null;
  typedText: string;
  lastDiff: DiffResult | null;
  revealedIndices: number[];
}

export interface SeekRequest {
  ms: number;
  nonce: number;
}

export interface DictationState {
  phase: DictationPhase;
  parts: PartState[];
  currentPartIndex: number;
  input: string;
  relaxed: boolean;
  speed: number;
  isPlaying: boolean;
  seekRequest: SeekRequest | null;
  mediaNonce: number;
  earnedXp: number;
  start: (lesson?: readonly { transcript: string }[]) => void;
  play: () => void;
  pause: () => void;
  replay: () => void;
  setSpeed: (v: number) => void;
  seek: (ms: number) => void;
  setInput: (v: string) => void;
  check: () => void;
  hint: () => void;
  skip: () => void;
  next: () => void;
  prevPart: () => void;
  toggleRelaxed: () => void;
  reset: () => void;
}

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;

const isActive = (phase: DictationPhase): boolean =>
  phase === "playing" || phase === "input" || phase === "checked";

const isLessonOpen = (phase: DictationPhase): boolean =>
  phase !== "idle" && phase !== "complete";

const initialState = {
  phase: "idle" as DictationPhase,
  parts: [] as PartState[],
  currentPartIndex: 0,
  input: "",
  relaxed: false,
  speed: 1,
  isPlaying: false,
  seekRequest: null,
  mediaNonce: 0,
  earnedXp: 0,
};

export function createDictationStore(): StoreApi<DictationState> {
  return createStore<DictationState>()((set, get) => {
    /** Part hiện tại (invariant: phase ACTIVE ⟹ index hợp lệ — spec §3.2). */
    const current = (): PartState => get().parts[get().currentPartIndex]!;

    /** Advance (spec §3.2): part pending ĐẦU TIÊN sau current; không còn →
     * complete (nhánh else duy nhất — mọi part khi đó done‖skipped). */
    const advance = () => {
      const s = get();
      let target = -1;
      for (let i = s.currentPartIndex + 1; i < s.parts.length; i++) {
        if (s.parts[i]!.status === "pending") {
          target = i;
          break;
        }
      }
      if (target === -1) {
        set({ phase: "complete", isPlaying: false, seekRequest: null });
        return;
      }
      set({
        currentPartIndex: target,
        input: "",
        phase: "playing",
        isPlaying: true, // autoplay câu kế (spec §5.1)
        mediaNonce: s.mediaNonce + 1,
        seekRequest: { ms: 0, nonce: s.mediaNonce + 1 },
      });
    };

    /** Patch part hiện tại theo index (immutability cho useStore selectors). */
    const patchCurrent = (patch: Partial<PartState>) => {
      const s = get();
      set({
        parts: s.parts.map((p, i) =>
          i === s.currentPartIndex ? { ...p, ...patch } : p,
        ),
      });
    };

    return {
      ...initialState,

      start: (lesson) => {
        const s = get();
        if (lesson) {
          if (s.phase !== "idle") return;
          const parts = lesson.map((p, i) => ({
            index: i,
            transcript: p.transcript,
            status: "pending" as const,
            attempts: 0,
            usedHint: false,
            xpEarned: 0,
            firstAccuracy: null,
            typedText: "",
            lastDiff: null,
            revealedIndices: [],
          }));
          if (parts.length === 0) {
            set({ parts, phase: "complete" }); // degenerate — spec §3.2
            return;
          }
          set({ parts, currentPartIndex: 0, phase: "start-gate" });
          return;
        }
        // Gesture "Bắt đầu" (spec §5.1 — user gesture cho autoplay policy).
        if (s.phase === "start-gate") {
          set({ phase: "playing", isPlaying: true });
        }
      },

      play: () => {
        const s = get();
        if (!isActive(s.phase)) return;
        set({
          isPlaying: true,
          phase: s.phase === "input" ? "playing" : s.phase,
        });
      },

      pause: () => {
        const s = get();
        if (!isActive(s.phase)) return;
        set({
          isPlaying: false,
          phase: s.phase === "playing" ? "input" : s.phase,
        });
      },

      replay: () => {
        const s = get();
        if (!isActive(s.phase)) return;
        set({
          seekRequest: { ms: 0, nonce: s.mediaNonce + 1 },
          mediaNonce: s.mediaNonce + 1,
          isPlaying: true,
          phase: s.phase === "input" ? "playing" : s.phase,
        });
      },

      setSpeed: (v) => {
        if (!(SPEEDS as readonly number[]).includes(v)) return;
        set({ speed: v });
      },

      seek: (ms) => {
        const s = get();
        if (!isActive(s.phase)) return;
        set({
          seekRequest: { ms, nonce: s.mediaNonce + 1 },
          mediaNonce: s.mediaNonce + 1,
        });
      },

      setInput: (v) => {
        const s = get();
        if (!isActive(s.phase) || current().status !== "pending") return;
        set({ input: v, phase: s.phase === "checked" ? "input" : s.phase });
      },

      check: () => {
        const s = get();
        if (!isActive(s.phase) || current().status !== "pending") return;
        const part = current();
        const mode: CompareMode = s.relaxed ? "relaxed" : "strict";
        const diff = diffWords(part.transcript, s.input, mode);
        const isFirst = part.attempts === 0;
        const firstAccuracy = computeAccuracy(diff);
        // XP chỉ attempt ĐẦU của part (spec §5.5) — bank theo accuracy attempt đó;
        // các attempt sau KHÔNG ghi đè xpEarned/firstAccuracy đã bank.
        const xp = isFirst
          ? computeXp({
              accuracy: firstAccuracy,
              usedHint: part.usedHint,
              relaxed: s.relaxed,
              isFirstAttempt: true,
            })
          : 0;
        patchCurrent({
          attempts: part.attempts + 1,
          typedText: s.input,
          lastDiff: diff,
          xpEarned: isFirst ? xp : part.xpEarned,
          firstAccuracy: isFirst ? firstAccuracy : part.firstAccuracy,
        });
        set({ earnedXp: s.earnedXp + xp, phase: "checked" });
      },

      hint: () => {
        const s = get();
        if (!isActive(s.phase) || current().status !== "pending") return;
        const part = current();
        // Diff TƯƠI từ input hiện tại (spec §3.2 — hint TRƯỚC check đầu hợp lệ).
        const mode: CompareMode = s.relaxed ? "relaxed" : "strict";
        const idx = diffWords(part.transcript, s.input, mode)
          .firstIncorrectIndex;
        if (idx === null || part.revealedIndices.includes(idx)) return;
        patchCurrent({
          usedHint: true,
          revealedIndices: [...part.revealedIndices, idx],
        });
      },

      skip: () => {
        const s = get();
        if (!isActive(s.phase) || current().status !== "pending") return;
        // Action skip không cộng XP; XP đã bank ở check đầu GIỮ NGUYÊN (§3.2).
        patchCurrent({ status: "skipped" });
        advance();
      },

      next: () => {
        const s = get();
        if (!isActive(s.phase)) return;
        const part = current();
        if (part.status === "pending") {
          if (part.attempts === 0) return; // chưa check lần nào — Enter = check
          // allCorrect (theo lần check gần nhất) → done; còn sai → skipped
          // ngầm ("Câu tiếp" luôn hiện sau check đầu — §5.4; XP đã bank giữ).
          patchCurrent({
            status: part.lastDiff?.allCorrect === true ? "done" : "skipped",
          });
        }
        advance();
      },

      prevPart: () => {
        const s = get();
        if (!isActive(s.phase) || s.currentPartIndex === 0) return;
        const part = s.parts[s.currentPartIndex - 1]!;
        set({
          currentPartIndex: part.index,
          input: part.typedText,
          seekRequest: { ms: 0, nonce: s.mediaNonce + 1 },
          mediaNonce: s.mediaNonce + 1,
          phase: part.lastDiff ? "checked" : "input",
        });
      },

      toggleRelaxed: () => {
        const s = get();
        if (!isLessonOpen(s.phase)) return;
        set({ relaxed: !s.relaxed });
      },

      reset: () => {
        set({ ...initialState, parts: [], seekRequest: null });
      },
    };
  });
}

/** Progress bar (spec §5.6): done/total — skip KHÔNG tính done. */
export function lessonProgress(state: { parts: PartState[] }): {
  done: number;
  skipped: number;
  total: number;
} {
  return {
    done: state.parts.filter((p) => p.status === "done").length,
    skipped: state.parts.filter((p) => p.status === "skipped").length,
    total: state.parts.length,
  };
}

/** Màn kết quả (spec §5.7): accuracy TB **attempt đầu** của các part done
 *  (done ⟹ allCorrect nên acc attempt-sau luôn 1 — vô nghĩa; không có → 0). */
export function averageAccuracyOfDone(parts: PartState[]): number {
  const done = parts.filter((p) => p.status === "done");
  if (done.length === 0) return 0;
  return (
    done.reduce((sum, p) => sum + p.firstAccuracy!, 0) / done.length
  );
}

/** Singleton cho SF-4 (module-level); test dùng factory. */
export const dictationStore = createDictationStore();

/** Hook wrapper (spec §3.1) — selector-based, render trong React component. */
export const useDictationStore = <T,>(
  selector: (s: DictationState) => T,
): T => useStore(dictationStore, selector);
