# SF-4 Dictation UI lesson page — design spec (VU-19)

> Spec slice của epic `2026-09-28-iloveenglishclub-design.md` §5 (contract chốt cứng) + context pack `docs/superpowers/contexts/sf-4.md` (ACCEPTANCE + boundary) + design hand-off `docs/superpowers/designs/vu15-dictation-direction.md` (B "Classroom Warm", user-approved 2026-09-29 — nguồn sự thật mọi giá trị số).
> Engine: `src/lib/dictation/*` (SF-3 — READ-ONLY, bug lệch contract → flag coordinator). Content: `src/lib/content/queries.ts` (SF-2 — READ-ONLY).
> **Boundary: KHÔNG ghi attempts/XP/progress vào DB (SF-6) — in-memory only; KHÔNG SEO metadata (SF-7); KHÔNG admin (SF-5); KHÔNG sửa lib SF-3.**

## 0. Vấn đề & chiến lược

Route lesson (`/[locale]/books/[book]/units/[unit]/lessons/[lesson]/listen-and-type`) đang là placeholder SF-2. Cần UI nối engine SF-3 thành trải nghiệm hoàn chỉnh: start-gate → nghe → gõ → check word-diff → sửa lại → hint/skip → điều hướng part → màn kết quả. Demo end-to-end trên browser là sản phẩm của phase này.

**Chiến lược:** RSC page fetch data (SF-2 queries) → 1 client orchestrator nhận props serializable; state machine 100% ở store SF-3 (đã test 100% nhánh); component chỉ render + sync `<audio>` qua `mediaNonce` (đúng contract store ghi sẵn: "SF-4 sync audio element qua effect theo nonce"). Design tokens đã có sẵn trong `globals.css` (SF-1 map đủ) — KHÔNG thêm token.

## 1. Scope

**IN:** thay `listen-and-type/page.tsx`; `src/components/dictation/*`; `src/lib/actions/relaxed-mode.ts`; helper thuần `src/lib/dictation-ui/format.ts` + test; messages `{en,vi}/lesson.json` (thêm keys `dictation.*`, xóa `placeholder.*` — orphan do chính SF-4 thay page); Playwright infra (`playwright.config.ts`, devDep `@playwright/test`, `e2e/dictation-guest.spec.ts`).

**OUT:** persist attempts/XP (SF-6), login-giữa-lesson commit (SF-6), metadata file riêng (SF-7), admin (SF-5), jsdom/Testing-Library component tests (infra mới — flow do e2e phủ, helpers do unit test phủ; deviation có chủ đích khỏi epic §9 bảng "Component" — SF-3 đã phủ state machine 100%).

## 2. Kiến trúc component

```
page.tsx (RSC, ISR 300, generateStaticParams [] — KHÔNG auth() trong RSC:
  auth() đọc cookies ⟹ dynamic, hỏng ISR. Session phía client qua useSession()
  — SessionProvider đã có ở Providers; relaxed-sync chạy trong Start handler)
  ├─ getBook/getUnit/getLesson (SF-2) + getLessons (tính next lesson href)
  └─ <DictationLesson>  ("use client" — orchestrator DUY NHẤT của route)
       ├─ state START:      <StartGate>        badge/h1/lead/FactPills/nút Start
       ├─ state DICTATION:  breadcrumb + <SentenceDots> + tabs row
       │    ├─ tabs: Dictation | <TranscriptTab> · phải: <ShortcutsHelp> + <RelaxedToggle> + XP chip + "Part n/m"
       │    ├─ <Worksheet>: <DictationPlayer> · <HintStrip> · <TypePanel>(textarea) · <WordDiffDisplay> · <LessonActions>(Skip|Check|Câu tiếp)
       │    ├─ <LoginBanner> (guest)
       │    └─ <PartNav>: <ProgressBar> + ‹ Part n/m ›
       ├─ state COMPLETE:   <ResultsScreen>    AccuracyRing + RewardPills + Try again / Bài tiếp theo + <LoginBanner>
       ├─ <ShortcutsPanel> (popover, toggle từ ShortcutsHelp)
       └─ audio: <audio ref> chính + hidden <audio preload="auto"> câu kế
```

Quy ước: mỗi file một component domain-named PascalCase đúng touch map; class compose bằng `cn()`; MỌI copy qua `useTranslations("lesson")` namespace `dictation.*`; selector store trả PRIMITIVE hoặc `useShallow` (cảnh báo re-render vô hạn trong store.ts).

## 3. Hành vi từng mảnh (resolve các điểm nhập nhằng)

### 3.1 StartGate (§5.1)
- Render khi `phase==="idle"` (SSR-safe — store singleton khởi tạo idle cả server/client, không hydration mismatch).
- Nút "Start part" = user gesture, handler chạy CHUỖI ĐỒNG BỘ: `start(parts)` (→ start-gate) → **relaxed-sync**: nếu `session authenticated` và `readRelaxedMode()===true` và `!store.relaxed` → `toggleRelaxed()` (phase start-gate ⟹ `isLessonOpen` true — mount effect ở idle bị guard chặn, KHÔNG dùng) → `start()` (→ playing + isPlaying). Một click, ba lệnh — gesture chain hợp lệ autoplay policy.
- Session/guest: `useSession()` client-side (UserMenu cùng pattern); guest = banner + XP "chưa lưu"; user = relaxed-sync như trên.
- FactPills: `{n} sentences · ~{sum(durationMs)}s audio · ~{ceil(n/2)} min (30s/câu heuristic — prototype 4 câu → ~2 minutes) · +{n×10} XP max` (XP max = 10/part — công thức contract epic §5.5 thắng con số minh họa 25 của prototype; ghi nhận chủ đích để Rule 0 không tưởng là defect).

### 3.2 DictationPlayer (§5.2)
- Pill theo design: play 52px (`--primary`, shadow đặc `0 3px 0 --primary-deep`, active translate) + Waveform 28 bar + time + SpeedToggle.
- Waveform: 28 bar height pattern cố định từ hand-off §1.9; bar fill `round(elapsed/duration×28)` — elapsed theo `audio.currentTime` (state local, cập nhật qua `timeupdate` + `seeked`).
- Time `m:ss / m:ss`: duration = `audio.duration` khi hợp lệ, fallback `durationMs/1000` từ DB; `formatTime()` helper (unit-tested).
- Play/pause nút: `isPlaying` → pause icon; click → `play()`/`pause()`. Icon = replay khi `ended`.
- SpeedToggle: cycle 1 → 1.25 → 1.5 → 0.5 → 0.75 → 1 (đủ SPEEDS SF-3, hiển thị `1x/1.25x/...`); `setSpeed` → effect áp `audio.playbackRate`.
- Seek: click waveform → seek theo tỉ lệ vị trí; nút `←/→` (§3.6) seek ±3000ms clamp [0, duration] qua `store.seek(ms)`.
- Sync effect — MAIN audio element (src/currentTime/play/pause chỉ driven ở ĐÂY; speed + preload là element riêng) — MỘT effect, deps `[isPlaying, mediaNonce, audioUrl]`, ref guard chống re-apply (store KHÔNG bump nonce khi play/pause, KHÔNG clear seekRequest — spec-critic P0):
  1. `audioUrl` khác src hiện tại → set `src`, `load()`.
  2. `seekRequest` + `seekRequest.nonce !== appliedNonceRef.current` → `currentTime = ms/1000` + lưu nonce vào ref (consume-once — pause→play không re-apply seek cũ).
  3. `isPlaying` → `play().catch(() => {})` (autoplay chặn → im lặng); ngược lại `pause()`.
  - playbackRate: effect riêng theo `[speed]` (set cả sau load mới).
- Preload câu kế: `<audio preload="auto" src={next.audioUrl}>` hidden khi part kế tồn tại.
- Part không có audio (audioPath null — model cho phép; published lesson thực tế luôn có audio do publish gate SF-5): player disabled + note; flow gõ vẫn chạy; time display fallback `0:00 / 0:00` khi cả durationMs null.

### 3.3 TypePanel + input (§5.3)
- Textarea trong `rounded-2xl border-2 border-dashed border-input` wrapper, placeholder "Type what you hear...".
- Attrs: `autoCapitalize="none" autoCorrect="off" spellCheck={false}` (mobile accuracy — ACCEPTANCE dòng 5).
- `Enter` → `preventDefault()` (không xuống dòng) → branch theo **(part.attempts, lastDiff.allCorrect) — KHÔNG phụ thuộc phase** (setInput đổi checked→input sau mỗi keystroke khi đã check-sai — phase-based sẽ chết ở lần sửa đầu):
  | Điều kiện part (status pending) | Enter |
  |---|---|
  | `attempts === 0` | `check()` |
  | `attempts ≥ 1 && lastDiff.allCorrect` | `next()` |
  | `attempts ≥ 1 && !allCorrect` (phase input/checked) | `check()` lại (không giới hạn) |
  - Part RESOLVED (review) → textarea `readOnly` + Enter no-op.
- `onPaste` → `preventDefault()` (paste bị chặn — spec §5.3).

### 3.4 WordDiffDisplay (§5.4 + design token §2.2)
- Render từ `part.lastDiff` khi `attempts ≥ 1` — **persist trong lúc đang sửa** (không ẩn khi phase về input; user sửa đối chiếu diff, render lại ở check kế).
- Token `matched` → xanh (`bg color-mix success 16%`, text success); `wrong` → đỏ gạch (`destructive` tint, line-through) + chip từ đúng absolute `-top-6` bg success; `missing` → đỏ + chip từ đúng, thân token "—" (không có typedToken); `extra` → đỏ, KHÔNG chip (không có "từ đúng").
- Diff-note **theo mode** (strict là default — prototype copy mù chữ mode): strict → "Green — correct. Red — your word, with the correct one on top. Capitalisation and punctuation count."; relaxed → "...are forgiven." (VI tương ứng).
- `allCorrect` → banner "Chính xác!" (success tint) + nút chính chuyển thành "Câu tiếp" (Enter cũng vậy).
- Sau check ĐẦU TIÊN (`attempts≥1`, part còn pending): nút "Câu tiếp" luôn hiện (kể cả còn sai — bấm = skipped ngầm theo `next()` SF-3, XP đã bank giữ).

### 3.5 HintStrip + LessonActions (§5.4)
- HintStrip: khi `revealedIndices.length>0` — chips các `transcript` token đã lộ (thứ tự reveal — thứ tự lưu trong store) + label "Hint"; khi `part.usedHint` thêm suffix pill "XP ×0.8" (giải thích mark đã-hint — context pack #4); đặt giữa player và type panel.
- Nút Hint (icon lightbulb, ghost) trong actions row: `hint()` — disabled khi `firstIncorrectIndex===null` (đúng hết) hoặc khi click không đổi gì thêm (store no-op đã lộ hết index đó).
- Actions row: trái `Skip` (ghost) + `Hint` (ghost); phải `Check` (primary, icon check) hoặc `Câu tiếp` (primary, icon arrow) sau check đầu. RelaxedToggle KHÔNG ở đây — duy nhất 1 chỗ: tabs row phải (§2, đúng "Settings góc phải" của visual reference).
- Skip: `skip()` — mark skipped, không XP, không done (§5.4), advance. Disabled khi part RESOLVED.
- Mọi nút disabled khi part đóng băng (review mode) trừ nav.

### 3.6 Keyboard shortcuts (§5 "Shortcuts" + §5.2)
- Document-level `keydown` (orchestrator), chỉ khi `phase` ACTIVE và tab Dictation đang mở:
  - `Tab` → `preventDefault()` + `replay()` — spec §5 đã chốt (a11y rationale: input là field duy nhất; review lại ở audit M6).
  - `Escape` → `pause()`.
  - `Ctrl+Shift+/` → `hint()`.
  - `ArrowLeft/ArrowRight` → seek ∓3s — **CHỈ khi `event.target` KHÔNG phải textarea** (không cướp phím chỉnh sửa con trỏ; ghi chú trong ShortcutsPanel).
  - `Enter` xử lý ở textarea (§3.3), không document-level.
- Part RESOLVED (review): shortcuts im (guard store tự no-op, UI không preventDefault ngoài Tab/Esc).

### 3.7 ShortcutsPanel
- Nút "?" (icon keyboard) góc phải tabs row → popover liệt kê: Tab replay · Enter check/next · Ctrl+Shift+/ hint · Esc pause · ←/→ seek ±3s (khi không gõ). Xem được mọi lúc trong DICTATION.

### 3.8 RelaxedToggle (context pack #6)
- Chip-toggle hiển thị trạng thái store `relaxed`; bấm → `toggleRelaxed()` ngay (optimistic) + nếu `user` → gọi server action persist (fire-and-forget với toast lỗi nếu fail — state UI vẫn theo store).
- Server action `src/lib/actions/relaxed-mode.ts`: `"use server"`; `auth()` → không session thì trả `{ok:false}`; `db.update(profiles).set({relaxedMode}).where(eq(profiles.id, session.user.id))` — tự sửa đúng profile của mình, không nhận userId từ client.
- Guest: in-memory thôi (không gọi action).

### 3.9 PartNav + ProgressBar + SentenceDots (§5.6, context pack #7/#8)
- ProgressBar: `lessonProgress()` — fill `done/total` (skip KHÔNG tính), 10px pill theo design.
- SentenceDots: `done`=success · current=primary ring-4 ring · else border (design §1.9) — `aria-label` "Sentence n of m", dots `aria-hidden`.
- Nav row: `‹` → `prevPart()` (review part trước; disabled tại 0); `›` → **thuần điều hướng**: chỉ enabled khi part hiện tại RESOLVED (done/skipped) → `next()` advance tới part pending kế; part pending (kể cả đã check) → disabled (không resolve ngầm — resolve chỉ qua "Câu tiếp"/Skip). Label "Part n / m" `tabular-nums`.
- Part xong thu gọn: dots highlight + khi review lại (`prevPart`) part hiện diff read-only (đúng/sai highlight từ `lastDiff`).

### 3.10 TranscriptTab (§5.9, context pack #11)
- Bật sau khi bắt đầu (tabs chỉ render ở DICTATION — start-gate chưa thấy transcript).
- List câu: index teal + text; part `done`/`skipped` hiện text; part `pending` → `blur-sm select-none` + `aria-hidden` + lock-note "Finish the part to unlock the full transcript." (đúng prototype).
- Audio player tổng: nút "Play all" — queue tuần tự part 1→N qua chính audio ref phụ riêng của tab (element riêng, không đụng player chính); dừng khi bấm lại hoặc hết. Highlight câu đang phát.

### 3.11 LoginBanner + XP ephemeral (§5.8, context pack #10, plan-critic P1)
- Guest (`user===null`): banner card dưới worksheet (và trong ResultsScreen): icon + "Đăng nhập để lưu điểm" + link `/login` (ghost button).
- XP live chip trong tabs row: `+{earnedXp} XP`; guest kèm đuôi pill muted "chưa lưu" (`title` giải thích) — phân biệt rõ với user đã login (không đuôi).

### 3.12 ResultsScreen (§5.7, context pack #9)
- Khi `phase==="complete"`: badge eyebrow `{book} · {unit}` → h1 "Great job, {name}!" — 2 variant message: user có name → có param; guest/không name → key riêng không param (next-intl strict params) → ResultGrid:
  - AccuracyRing SVG 128px r=52 stroke 12, `strokeDasharray = pct×326.7`, rotate -90°, số Baloo 30px giữa — accuracy = `averageAccuracyOfDone(parts)` (attempt ĐẦU của part done — helper SF-3).
  - RewardPills: `+{earnedXp} XP earned` (guest thêm chip "chưa lưu") · streak placeholder "— day streak" (SF-6 nối data) · chip "Words to review: …" — **nguồn: lastDiff của part `skipped` (wrong/missing token, unique, ≤6)** — part done luôn allCorrect nên không đóng góp; rỗng → ẩn chip.
- Actions: `Try again` (ghost) → `reset()` + `start(lesson)` + `start()` (click = gesture → chơi lại ngay) · `Bài tiếp theo` (primary) → href next lesson RSC tính; không có → về unit page (`/books/{book}/units/{unit}`).

## 4. Data flow & contracts

- Page RSC props → orchestrator (đều serializable): `lesson: {parts: [{id, text, audioUrl|null, durationMs}], title, number}` · `bookTitle, unitTitle, cefrLabel` · `user: {name}|null` · `initialRelaxed: boolean` · `nextLessonHref: string|null` · `loginHref`.
- `audioUrl` resolve bằng `resolveAudioUrl()` (SF-2 storage abstraction) ở RSC — client không import storage.
- Store singleton `dictationStore` từ SF-3; **`reset()` on unmount** (route change khỏi stale giữa 2 lesson).
- KHÔNG có write DB nào ngoài relaxed-mode action.

## 5. i18n (messages/{en,vi}/lesson.json)

Namespace mới `dictation` (keys: start.*, facts.*, player.*, input.placeholder, actions.check/next/skip/hint/relaxed, diff.banner/diffNote, results.*, transcript.*, shortcuts.*, banner.login/xpUnsaved, part.*). Xóa `placeholder` namespace (orphan của SF-4). VI copy theo giọng design hand-off (khích lệ, "Great job" → "Tuyệt vời, {name}!").

## 6. Testing

| Lớp | Gì | Ở đâu |
|---|---|---|
| Unit (Vitest, node) | `formatTime`, XP-max/facts tính, seek clamp, waveform fill count | `src/lib/dictation-ui/format.test.ts` |
| E2E (Playwright, chromium) | Guest happy path: mở lesson → Start → player hiện → gõ sai → Check → diff đỏ/xanh + chip đúng → sửa → Check lại → "Chính xác!" → Câu tiếp ×3 → Hint lộ 1 từ + XP ×0.8 → Skip 1 part không cộng → hết bài → Results accuracy/XP + banner "đăng nhập để lưu" + nút Bài tiếp theo; paste bị chặn; part-nav không nhảy tới part chưa làm | `e2e/dictation-guest.spec.ts` |

- Playwright config: webServer `npm run dev` port **3100** (tránh 3000 dev thường), `reuseExistingServer: !CI`, launch args `--autoplay-policy=no-user-gesture-required`, baseURL `http://localhost:3100`. Env DB từ `.env.local` (gitignore — local `ilec` đã seed demo L3-U1-L1 4 part có audio; audio reachability đã kiểm trước T2: files commit `public/audio/level-3/unit-1/lesson-1/*.mp3` + driver local serve `/audio/...`).
- Enter-vs-button trong e2e: check ĐẦU qua **Enter**, check-lại qua **nút Check** (pin cả hai đường — spec-critic P1).
- Shortcuts (Tab/Esc/arrows) + relaxed toggle UI: browser-verify thủ công Rule 0 (e2e guest không phủ — GHI evidence).
- Browser verify Rule 0 (3 tầng) chạy thủ công trước khi coi xong: DOM đo + screenshot so `b.html` + flow walkthrough.

## 7. Risks & unknowns

- Autoplay sau advance: Chrome chấp nhận sau gesture đầu; Safari/iOS probe best-effort (context pack ghi "nếu có thiết bị") — `play().catch` im lặng, nút play luôn available.
- Playwright browser download có thể fail trong sandbox → báo cáo trung thực, không fake evidence.
- Tab=replay đè keyboard-nav: đã ghi rationale + hẹn audit M6 (spec epic).
- Store singleton + React 19 StrictMode double-effect: sync effect idempotent (ref guard nonce + src so sánh) — không play trùng.
- Headless `timeupdate` không fire → elapsed 0 → waveform 0 fill: chấp nhận (e2e không assert fill count).
- Arrow-seek clamp duration: `audio.duration` hợp lệ → dùng; không → `durationMs` DB; cả hai null → 0 (no-op).
- XP chip user đã-login vẫn ephemeral tới SF-6 (commit là việc SF-6) — `title` ghi chú; guest có thêm pill "chưa lưu".
- Zero-part lesson: `start()` → complete ngay (store) → Results rỗng 0% — degenerate, publish gate SF-5 chặn khỏi prod.
- `notFound()` cho slug lesson không hợp lệ (giữ convention placeholder SF-2).
