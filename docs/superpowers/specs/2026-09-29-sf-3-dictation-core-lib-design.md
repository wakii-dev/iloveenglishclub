# SF-3 Dictation core lib — design spec (VU-18)

> Spec slice của epic `2026-09-28-iloveenglishclub-design.md` §5 (test contract chốt cứng) + §11 quyết định.
> Context pack: `docs/superpowers/contexts/sf-3.md`. Bracket: `docs/superpowers/brackets/vu15-iloveenglishclub.md`.
> **KHÔNG UI, KHÔNG Server Action, KHÔNG audio handling** — pure modules + Zustand store + Vitest 100% nhánh.

## 0. Vấn đề & chiến lược

Cả client (preview trong lesson — SF-4) lẫn server (recompute khi submit — SF-6) phải dùng **cùng một logic chấm điểm** để XP không thể bị gian lận phía client. Chiến lược: pure module, zero I/O, deterministic, test 100% nhánh làm living-spec của bảng scoring rules.

**Scope IN:** `diff.ts` (tokenize/normalize/diff/accuracy/wpm/XP), `store.ts` (state machine §5.4), `split-sentences.ts`, test tương ứng, coverage config.
**Scope OUT:** UI/component (SF-4), DB/Server Action (SF-6), audio element/file handling, admin import flow (SF-5 chỉ import `split-sentences`).

## 1. `src/lib/dictation/diff.ts` — scoring contract

### 1.1 Tokenize + normalize

- `tokenize(text: string): string[]` — normalize apostrophe cong `’` → `'` trên **toàn text** rồi `trim().split(/\s+/)`; text rỗng/chỉ whitespace → `[]`. Contraction giữ 1 token ("don't" = 1 token).
- Tokenize giống nhau ở CẢ 2 mode (normalize mode-level không đổi số token) → mẫu số `transcriptWordCount` bất biến theo mode.

### 1.2 Compare mode + diff

`type CompareMode = "strict" | "relaxed"`

- **strict** (mặc định): so token nguyên bản (sau apostrophe-normalize). Hoa/thường phân biệt; dấu câu đính token tính khác: `"cat."` ≠ `"cat"`.
- **relaxed**: lowercase + strip dấu câu **chỉ ở biên token** (regex dựng từ string để né TS5.5 regex-check với target ES2017: `^[\p{P}\p{S}]+|[\p{P}\p{S}]+$`, flag `gu`). Dấu câu **giữa token** giữ nguyên: `don't`, `3.5` bất biến. Token strip về `""` so sánh như `""` (đổi `""` với `""` = matched).

`diffWords(transcript, typed, mode): DiffResult` — **positional (index-aligned)**: so `transcript[i]` với `typed[i]` theo thứ tự (đọc literal §5 "so khớp thứ tự từ").

```ts
type WordStatus = "matched" | "wrong" | "missing" | "extra";
interface DiffWord {
  transcriptIndex: number;  // -1 với token extra (vượt độ dài transcript)
  transcriptToken: string | null; // null với extra
  typedToken: string | null;      // null với missing
  status: WordStatus;
}
interface DiffResult {
  words: DiffWord[];            // transcript tokens (0..n-1) rồi extra tokens
  matchedCount: number; wrongCount: number; missingCount: number; extraCount: number;
  transcriptWordCount: number;
  firstIncorrectIndex: number | null; // index transcript đầu tiên có status wrong|missing
  allCorrect: boolean;                // mọi từ transcript matched VÀ extraCount === 0
}
```

Ví dụ test contract (bắt buộc phủ):
- transcript `"The cat."` / typed `"The cat"` strict → `cat.` wrong (≠`cat`), allCorrect=false; relaxed → matched, allCorrect=true.
- transcript `"I don’t know"` / typed `"I don't know"` → matched (1 token `don't`), allCorrect=true.
- typed thừa từ: `"The cat"` / `"The fat cat"` positional → `cat`≠`fat` wrong + `cat` extra; accuracy 1/2.
- typed thiếu từ: `"The big cat"` / `"The cat"` → `big` wrong (typed `cat` lệch vị trí), `cat` missing; accuracy 1/3 (positional: thiếu từ giữa làm lệch phần sau — hệ quả chấp nhận của direction A).

### 1.3 Accuracy / WPM / XP

- `computeAccuracy(diff): number` = `matchedCount / transcriptWordCount`, scale 0–1. **Mẫu số là TRANSCRIPT** (typed thừa từ không tăng điểm). transcript 0 từ → 0 (guard chia 0).
- `computeWpm(diff, durationMs): number` = `matchedCount / (durationMs/60000)` — **duration audio gốc** (client gửi durationMs của file, không theo playbackRate). durationMs ≤ 0/null → 0.
- `computeXp({accuracy, usedHint, relaxed, isFirstAttempt}): number` = `Math.round(10 × accuracy × (usedHint?0.8:1) × (relaxed?0.5:1))`, **`isFirstAttempt === false → 0`**. Bảng chốt: 1.0×1×1 = **10**, hint = **8**, relaxed = **5**, attempt-lại = **0**. Float `10×0.8` = 8 exactly (JS), `Math.round` chốt nguyên.
- `scoreAttempt({transcript, typed, mode, durationMs, usedHint, relaxed, isFirstAttempt}): AttemptScore` — wrapper duy nhất SF-6 gọi khi recompute: `{accuracy, wpm, xp, diff}`.

### 1.4 Diễn giải đã chốt (đã post REQUIREMENT-GAP note lên epic VU-15, coordinator có thể veto)

1. **Positional diff** thay vì LCS — lý do: đọc literal spec, deterministic, chống gaming (LCS cho accuracy 1.0 dù thừa từ rác).
2. **XP accrue tại check ĐẦU TIÊN của part** theo accuracy attempt đó (đọc literal "chỉ attempt đầu của part, attempts sau xp=0"): check sai đầu tiên vẫn nhận XP theo accuracy; check lại đúng → 0.
3. Relaxed strip **chỉ biên token**; token rỗng sau strip so như `""`.

## 2. `src/lib/content/split-sentences.ts`

`splitSentences(text: string): string[]` — chia theo `.?!` **kèm dấu câu đính câu** (strict mode cần dấu câu!). Thuật toán: **scan thủ công** (không regex lookbehind — ES2018, target ES2017 + TS5.5 regex-check sẽ chặn literal): duyệt char, gặp `.?!` → câu kết thúc tại đó; cắt tại whitespace sau dấu. Trim từng câu, bỏ câu rỗng. Text không có dấu kết → 1 câu nguyên văn.

- `"Hi. Bye."` → `["Hi.", "Bye."]`; `"What?!"` → 1 câu `"What?!"`; ký tự xuống dòng cũng là separator (`\s`).
- **Known-limitation (behavior chấp nhận theo spec §6):** viết tắt `Mr.`/`e.g.`, số thập phân `3.5`, ellipsis `...` tách sai — UI admin (SF-5) cho sửa tay từng dòng; module KHÔNG xử lý viết tắt.

## 3. `src/lib/dictation/store.ts` — Zustand state machine §5.4

Zustand **vanilla** (`zustand/vanilla`): export `createDictationStore()` factory (test dùng instance mới mỗi lần) + singleton `dictationStore` + hook wrapper `useDictationStore` (SF-4 dùng; test node không render vẫn import được). Không persist, không middleware (persist = SF-6).

### 3.1 State

```ts
type DictationPhase = "idle" | "start-gate" | "playing" | "input" | "checked" | "complete";
type PartStatus = "pending" | "done" | "skipped";   // skip KHÔNG tính done
interface PartState {
  index: number; transcript: string; status: PartStatus;
  attempts: number;           // số lần check
  usedHint: boolean; xpEarned: number;
  typedText: string; lastDiff: DiffResult | null;
  revealedIndices: number[];  // index từ đã hint
}
interface DictationState {
  phase: DictationPhase;
  parts: PartState[]; currentPartIndex: number;
  input: string; relaxed: boolean;
  speed: number;                                  // 0.5|0.75|1|1.25|1.5
  isPlaying: boolean;                             // intent — SF-4 sync <audio>
  seekRequest: { ms: number; nonce: number } | null; // player effect theo nonce, không cần clear
  mediaNonce: number;
  earnedXp: number;                               // XP accrue in-memory (persist = SF-6)
}
```

Chuỗi phase: `idle` → `start-gate` → `playing`/`input` (vào/ra theo isPlaying) → `checked` (check; sai → sửa → về `input` → check lại **vô hạn** | đúng → banner = `checked` + `allCorrect`) → advance → … → `complete` (mọi part done-or-skipped).

### 3.2 Actions (guard + chuyển phase)

| Action | Guard | Hiệu ứng |
|---|---|---|
| `start(lesson?)` | `idle` + lesson → hydrate parts pending, phase `start-gate`. `start-gate` + không arg → phase `playing`, isPlaying=true (user gesture, autoplay câu đầu). | Khác phase: no-op |
| `play()` | `input`/`checked`/`playing` | isPlaying=true; `input`→`playing`. idle/gate/complete: no-op |
| `pause()` | đang active | isPlaying=false; `playing`→`input` |
| `replay()` | đang active | seekRequest={ms:0,nonce:++mediaNonce}, isPlaying=true, `input`→`playing` |
| `setSpeed(v)` | v ∈ {0.5,0.75,1,1.25,1.5} | speed=v; else no-op |
| `seek(ms)` | đang active | seekRequest={ms,nonce:++mediaNonce} |
| `setInput(v)` | `playing`/`input`/`checked` | input=v; `checked`→`input` (sửa sau check; banner tắt) |
| `check()` | `playing`/`input`/`checked` | diff theo mode hiện tại; attempts+1; **attempt đầu → xp=computeXp(...), earnedXp+=xp, part.xpEarned=xp**; typedText/lastDiff lưu; phase `checked` |
| `hint()` | đang active | diff hiện tại → index sai/missing đầu tiên chưa reveal → push revealedIndices, usedHint=true; hết sai → no-op (không flag) |
| `skip()` | part chưa resolve | status=`skipped` (không XP, không done) → advance |
| `next()` | `checked` | allCorrect → status `done`; còn sai → **skipped ngầm** (giữ invariant: advance được thì part phải resolve; "Câu tiếp" luôn hiện sau check đầu — §5.4) → advance. Part đã resolve (đang xem lại) → advance không remark. Chưa check: no-op |
| `prevPart()` | currentIndex>0, đang active | index−1; input=typedText part đó; có lastDiff → `checked` (xem lại), không → `input` |
| `toggleRelaxed()` | — | relaxed=!relaxed (ảnh hưởng check SAU đó) |
| `reset()` | — | về state idle ban đầu (đổi lesson — store là singleton) |

`advance`: tìm part `pending` từ current+1 (hết thì quét từ 0) → chuyển đến nó (input="", phase `playing`, isPlaying=true — autoplay câu kế, seekRequest về 0); không còn pending nào → **`complete`** (assert mọi part done‖skipped).

**Derived (pure, export cho SF-4):** `lessonProgress(state)` → `{done, skipped, total}` (progress bar: done/total, skip không tính); `averageAccuracyOfDone(parts)` → TB accuracy các part done (màn kết quả §5.7; không có part done → 0).

### 3.3 Store test không DOM

Factory tạo instance mới per test; gọi action qua `store.getState().action()` rồi assert `getState()`. Không render, không jsdom.

## 4. Vitest — 100% nhánh

- `vitest.config.ts`: coverage provider `@vitest/coverage-v8`, `include` **chỉ** `src/lib/dictation/**` + `src/lib/content/split-sentences.ts`, thresholds **branches/statements/functions/lines = 100** (scope hẹp — không siết file cũ của SF-1).
- CI chạy `npm test` (không coverage) — không đổi; chạy coverage cục bộ `npx vitest run --coverage`.
- Test matrix: từng ví dụ §1.2; bảng XP 10/8/5/0; mọi guard no-op (100% nhánh); state machine: check-sai→sửa→check-lại OK; skip không cộng done; complete chỉ khi mọi part done-or-skipped; hint reveal tuần tự; prevPart xem lại.

## 5. Export contract (cho SF-4/SF-5/SF-6)

- SF-4 import: `useDictationStore`, types, `lessonProgress`, `averageAccuracyOfDone`, `SPEEDS`.
- SF-5 import: `splitSentences`.
- SF-6 import: `scoreAttempt` (+ `diffWords` nếu cần chi tiết).
- Đổi signature sau khi publish = phải note trong commit message (boundary context pack).
