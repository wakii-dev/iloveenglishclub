# DIRECTION-FINAL — VU-15 · I Love English Club · Hướng B "Classroom Warm" (user-selected 2026-09-29)

> **Nguồn sự thật cho mọi giá trị số trong doc này.** Prototype đối chiếu trực quan: `docs/superpowers/prototypes/vu15-dictation/b.html` (link share: https://share.onorca.dev/a/venzIklcO8lB). Dev map thẳng `:root` + `.dark` → `app/globals.css` (shadcn convention, toggle qua class `dark` trên `<html>` — dùng next-themes `attribute="class"`).

---

## 1. DESIGN TOKENS

### 1.1 Colors — Light (`:root`)

```css
--background: #fff8f0;          /* kem ấm */
--foreground: #432818;          /* nâu đậm */
--card: #ffffff;
--card-foreground: #432818;
--primary: #e85d3d;             /* coral */
--primary-foreground: #fff8f0;
--secondary: #0e9488;           /* teal — fill progress + accents */
--secondary-foreground: #ffffff;
--muted: #fbeedd;
--muted-foreground: #8a6b52;
--accent: #f9e8d2;              /* hover bg */
--accent-foreground: #432818;
--destructive: #e23d3d;
--destructive-foreground: #ffffff;
--border: #f3e2ce;
--input: #ecd9bf;               /* dashed border của type-panel */
--ring: #f9b48f;
--success: #2e9e5b;
--success-foreground: #ffffff;
--primary-deep: #c2482e;        /* CUSTOM — shadow đặc nút primary */
--radius: 16px;
```

### 1.2 Colors — Dark (`.dark`)

```css
--background: #211711;
--foreground: #f8efe3;
--card: #2b1f16;
--card-foreground: #f8efe3;
--primary: #ff7a50;
--primary-foreground: #2b1408;
--secondary: #2dd4bf;
--secondary-foreground: #062a26;
--muted: #352718;
--muted-foreground: #c9ac90;
--accent: #3d2c1c;
--accent-foreground: #f8efe3;
--destructive: #f87171;
--destructive-foreground: #2b0808;
--border: #43301f;
--input: #4d3823;
--ring: #b45309;
--success: #4ade80;
--success-foreground: #052e16;
--primary-deep: #b94a2c;
```

Lưu ý shadcn: prototype thêm biến non-standard (`--primary-deep`, `--success` + `--success-foreground`) — giữ nguyên tên, thêm vào token type của theme.

### 1.3 Typography

```css
--font-display: "Baloo 2", Nunito, ui-rounded, sans-serif;   /* 600, 700 — h1/h2/h3, số step, wordmark */
--font-body: "Nunito", ui-rounded, -apple-system, "Segoe UI", sans-serif; /* 400, 600, 700, 800 — toàn bộ còn lại */
```

Import: Google Fonts `Baloo 2:wght@600;700` + `Nunito:wght@400;600;700;800` (next/font/google: `Baloo_2` + `Nunito`, variable `--font-display` / `--font-body`).

Scale (đúng từ prototype): body 15.5px/1.55 · hero h1 52px/700 (mobile 33px) · lesson h1 38px/700 · h2 28px/700 · level-card h3 17.5px · lead 17px w600 `text-muted-foreground` · breadcrumb 13.5px w700 · diff words 20px w600 line-height 2.1 · correction chip 12.5px w800 · kicker 13px w800 uppercase tracking 0.08em · footer h4 12.5px uppercase tracking 0.06em · số liệu (XP/điểm/time) luôn `tabular-nums`.

### 1.4 Radius map (px — dùng Tailwind arbitrary `rounded-[Npx]`)

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--radius` | 16px | type-panel, textarea, btn-lg |
| 14px | btn thường, user-chip, reward pill, unit idx | |
| 18px | level-card head/body, unit-row, lesson-row, mini-card | |
| 20px | method step | |
| 22px | book cover | |
| 24px | worksheet card | |
| 11px / 12px | brand mark / nav button | |
| 99px (full) | player pill, speed, badge, chips, tags, locale, progress bar | |
| 50% | play button, dots, avatar, icon-btn, step số | |

### 1.5 Spacing

Base 4px. Key: container `max-w-[1120px] px-6` · lesson content `max-w-[820px]` · header cao 64px sticky · hero `pt-14 pb-[60px]` (56/60) · section `py-[44px]` border-t-2 · worksheet `p-[26px]` (mobile 18/16) · gap chuẩn dùng: 8/10/12/14/16/18/24/28/44/48.

### 1.6 Shadow đặc (signature của hướng B — spec chính xác)

| Element | Rest | Active |
|---|---|---|
| `.btn-primary` | `shadow-[0_4px_0_theme(colors.primary-deep)]` | `translate-y-[3px]` + `shadow-[0_1px_0_...]` |
| Play button | `0 3px 0` | `translate-y-[2px]` + `0 1px 0` |
| Worksheet card | `0 10px 30px -18px color-mix(in srgb, var(--primary-deep) 35%, transparent)` | — |
| lesson-row.current | border-2 `--primary` + `0 6px 0 var(--ring)` | — |
| Book cover | `0 10px 0 color-mix(in srgb, var(--secondary) 55%, #000)` (dark: 35% black) | — |
| Hero mini-card | `0 12px 28px -16px color-mix(..., 40%, transparent)` | — |

Transition press physics: `transition-[transform,box-shadow] duration-[80ms]`; hover/colour transitions 150ms.

### 1.7 Color-code 7 level (band đầu level-card, chữ trắng w800)

| Level | Hex | | Level | Hex |
|---|---|---|---|---|
| L1 Pre-A1 | `#f59e0b` | | L5 B1 | `#7c3aed` |
| L2 A1 | `#e85d3d` | | L6 B1+ | `#be185d` |
| L3 A2 (current) | `#0e9488` | | L7 B2 | `#111827` |
| L4 A2+ | `#0284c7` | | | |

Đặt tên `--level-1` … `--level-7` (không đổi theo dark mode). Tag loại bài: Dictation = `--primary` · Vocabulary = `--secondary` · Grammar = `#f59e0b` · Listening = `#0284c7`.

### 1.8 Score chips + tint formula

- `.hi`: bg `color-mix(in srgb, var(--success) 16%, transparent)`, text `--success`
- `.mid`: bg `color-mix(in srgb, #f59e0b 18%, transparent)`, text `#b45309` (dark: `#fbbf24`)
- `.todo`: bg `--muted`, text `--muted-foreground`
- Badge eyebrow (unit eyebrow): bg `color-mix(in srgb, var(--secondary) 14%, transparent)`, text `--secondary`
- Giữ nguyên dạng `color-mix()` (không precompute hex) để tự thích ứng dark mode.

### 1.9 Waveform + progress (spec lặp lại ở mọi màn)

- Waveform: 28 bar, flex gap 3px, cao 38px (hero mini 26px), bar `max-w-[6px] rounded-[3px]`, bar đã-phát màu `--secondary`, chưa-phát màu `--border`. Height pattern (%) theo thứ tự: 22,40,64,38,80,52,30,58,88,44,26,60,74,36 \| 48,70,32,56,84,40,24,62,46,34,66,28,52,38. Số bar fill = `round(elapsed/duration × 28)`.
- Progress bar: cao 10px, `rounded-full bg-muted border-2 border-border`, fill `--secondary` (ratio: lesson part 2/21 = 9.5%).
- Sentence dots: 12px, gap 8px; done = `--success`; current = `--primary` + `ring-4` màu `--ring`; todo = `--border`.

---

## 2. STRUCTURE — từng màn

shadcn components dùng: Button, Card, Badge, Tabs, Textarea, Progress, ToggleGroup (locale/speed), Avatar, DropdownMenu (user), Separator. Đặt tên component theo domain (PascalCase), class compose bằng `cn()`.

### 2.1 Header (`<SiteHeader>`) — sticky, backdrop-blur, bg `color-mix(background 90%)`, border-b-2
- `<Brand>`: mark 32px `rounded-[11px] bg-primary rotate-[-6deg]` icon heart trắng + wordmark Baloo 700 17px, chữ "Club" màu primary.
- Nav: Home · Levels · Method · Unit (buttons, active `bg-muted text-primary`).
- Right: `<LocaleSwitch>` EN|VI (ToggleGroup, pill) · `<ThemeToggle>` (icon-btn 34px tròn) · `<UserChip>`: avatar 28px teal, name 13px w800, hàng stats XP + flame `#f97316` + số streak.

### 2.2 Lesson (`<DictationLesson>`) — max-w 820px, 3 state

- **State START**: badge eyebrow (`Level 3 (A2) · Unit 4 — Free time`) → h1 "Part 2 — My daily routine" → lead → `<FactPills>` (4 sentences · ~12s audio · ~2 minutes · +25 XP max) → `btn-primary btn-lg` "Start part" kèm icon play.
- **State DICTATION**: breadcrumb (Unit / **bài học** màu primary) → `<SentenceDots>` (done/now/todo) → Tabs (Dictation \| Full transcript — style btn-ghost, active nổi) → `<Worksheet>` card:
  - `<DictationPlayer>`: pill `rounded-full bg-muted border-2` — play 52px + `<Waveform>` + time `0:07 / 0:12` + `<SpeedToggle>` (1x → 1.25x → 0.75x, teal).
  - `<TypePanel>`: wrap textarea, `rounded-2xl border-2 border-dashed border-input bg-[mix-muted-55%-card]`, placeholder "Type what you hear...".
  - `<LessonActions>`: Skip (ghost, trái) — Check (primary + icon check, phải).
  - `<PartNav>` dưới worksheet: progress + row ‹ 2/21 › (nút tròn 38px).
  - Tab transcript: list câu, câu đã-xong hiện, chưa-xong `blur-sm select-none` + lock-note icon khóa.
- **State RESULT**: badge eyebrow → h1 "Great job, {name}!" → `<WordDiff>` → diff-note → `<ResultGrid>`: `<AccuracyRing>` (SVG 128px, r=52, stroke 12, track `--muted`, arc `--success` linecap round, `strokeDasharray = pct×326.7 / "327"`, rotate -90°; số 30px Baloo ở giữa) + `<RewardPills>` (+XP · flame streak · chip "Words to review") → Try again (ghost) / Next sentence (primary).
- WordDiff token: inline-block `rounded-xl px-[9px] py-[2px] mx-[2px]`; ok = tint success / text success; bad = tint destructive / text destructive `line-through` + chip từ đúng absolute `-top-6` giữa, bg `--success` text `--success-foreground` `rounded-full px-[10px] py-[2px] text-[12.5px] font-extrabold`. (Câu chốt diff-note: "Green — correct. Red — your word, with the correct one on top. Capitalisation and punctuation are forgiven.")

### 2.3 Home — hero split + path + method
- `<Hero>`: grid `1.1fr_0.9fr` gap-12; trái: kicker teal → h1 52px (VI: "Nghe thật kỹ. Gõ lại thật đúng.") → lead EN → dòng VI → 2 CTA (Continue Level N / Explore all levels) → trust row (7 levels · N lessons · Free core). Phải: `<HeroVisual>` container `rotate-[1.5deg]`, 2 mini-card (Now practicing / This week) — card 2 `rotate-[-2deg] translate-x-[18px]`, mỗi card có Progress.
- `<LevelPath>`: wrapper `relative`, đường nối `border-t-[3px] dashed border-border` tại top 44px; rail `flex overflow-x-auto gap-[18px]`; `<LevelCard>` 236px: head 64px band màu level (Level n + pill CEFR, pill bg `white/22`) + body trắng border-2 (h3 tên kỳ thi, exam desc, Progress, foot lessons/%).
- `<MethodGrid>`: 2×2 (max-w 840px), step = card 20px radius, số tròn 46px Baloo nền theo màu step: 1 teal `#0e9488`, 2 coral `#e85d3d`, 3 amber `#f59e0b`, 4 sky `#0284c7`; title song ngữ "Nghe / Listen"…

### 2.4 Book — grid 300px/1fr gap-11
- Aside: `<BookCover>` (placeholder typographic, aspect 3/4, bg teal, "Cambridge English Prepare / Level n / CEFR") + cover-note licensing + `<MetaList>` (CEFR, Target exam, Units, Lessons, Your progress).
- Main: `<UnitList>` — `<UnitRow>` card 18px: idx vuông 46px `rounded-[14px] bg-muted text-secondary Baloo` + title/small + side (Progress + score chip). Hover: border teal.

### 2.5 Unit — max-w 820px
- Page-head (breadcrumb + h1 + lead "x of y lessons done · average score z%").
- `<LessonList>`: `<LessonRow>` card 18px: tag loại (pill màu, uppercase 11px) + tên + score chip + hành động; row current: border `--primary` + shadow `0 6px 0 --ring` + nút Continue primary sm.

### 2.6 Footer — bg card, border-t-2
Grid `1.6fr_1fr_1fr_1fr` gap-8: brand + tagline VI · Levels (7 link) · Learn · Support; bottom bar: © 2026 I Love English Club · "EN / VI · Nghe · Gõ · Kiểm tra · Đọc to".

---

## 3. BEHAVIOR NOTES

**Motion (200ms tối đa, không animation trang trí):**
- Press physics 80ms (bảng 1.6); hover màu 150ms; card hover chỉ đổi border-color (không lift).
- Nút primary: `hover:brightness-105`. Level card hover: body border đậm hơn.
- Product-only (không có trong prototype): mount fade/rise 150-200ms `ease-out`, hoàn toàn qua `motion-reduce:` fallback; result screen có thể +1 confetti nhẹ 400ms (optional, tôn trọng reduced-motion).

**A11y:**
- Focus: toàn bộ interactive dùng `focus-visible:outline-3 outline-ring outline-offset-2` (3px theo prototype).
- Keyboard: mọi thứ là button/link thật → Enter/Space mặc định; Tab order theo DOM (breadcrumb → dots(aria) → tabs → player → textarea → Skip/Check → part-nav); part-nav arrows có aria-label; waveform + dots có `aria-hidden` + text thay thế (progress %).
- Locked transcript: `aria-hidden` + blur; product: nút tab disabled kèm tooltip lý do.
- Ưu tiên `prefers-reduced-motion` cho mọi transition/animation.
- **Contrast flags (chọn có chủ đích vì brand ấm, dev nên biết):** (a) text trắng trên `--primary` #e85d3d ≈ 3.3:1 — nếu cần AA strict cho nút, đổi bg nút sang `--primary-deep` #c2482e (~4.9:1) và giữ #e85d3d cho accent/hover; (b) success #2e9e5b trên tint ≈ 3.4:1 — dùng ở 20px w600 (large-text AA pass); muốn strict thì dark success `#278a4e`; (c) band L1 amber + chữ trắng ≈ 2.2:1 — chữ "Level 1" chỉ mang hình ảnh, thông tin thật nằm ở body card; nếu muốn AA, chữ band L1 đổi `#7c2d12`.

**Responsive — desktop-first, 2 breakpoint:**
- `max-width: 900px`: hero-grid 1 col; book-grid 1 col (cover max-w 230px); footer 2 col; nav giữa ẩn.
- `max-width: 640px`: h1 33px; method 1 col; unit-row bỏ progress; lesson-row về `1fr auto` (ẩn score); user-chip ẩn meta (chỉ avatar); worksheet padding 18/16.
- Level path là scroll ngang tự nhiên ở mọi size (đúng ý thiết kế — không cần grid hoá).
- Touch targets: play 52px, part-nav 38px, buttons ≥40px — đạt; locale pills nhỏ là chấp nhận được (secondary control).

**Theme + i18n runtime:** next-themes class `dark`, default light, persist localStorage, gốc toggle ở header (1 nguồn thật); next-intl với cookie locale, default EN, mọi copy trong message catalog (kể cả copy khích lệ "Great job, Mai!").

---

## 4. OUT OF DESIGN SCOPE (dev tự quyết)

- Chi tiết audio thật (codec, preload, replay-limit, autoplay policy) — prototype chỉ mock hình.
- Word-diff algorithm (tokenize, chuẩn hoá case/punctuation) — chỉ chốt UI contract: token ok/bad + hiển thị từ đúng phía trên token bad.
- Nghiệp vụ XP/streak/locked lesson — UI chỉ hiển thị.
- Data fetching, routing, error/empty/loading states (prototype là happy path) — dev dùng cùng token, skeleton theo muted.
- Ảnh bìa sách thật (license Cambridge) + brand logo thật — đang placeholder; khi có asset chỉ thay `<BookCover>`/`<Brand>`, không đổi layout.
- SEO, analytics, admin/teacher views.

---

Hand-off: mọi giá trị số trong doc này là nguồn sự thật; file `b.html` chỉ dùng để đối chiếu trực quan khi nghi ngờ.
