# VU-37 Vocabulary Memrise-like — Design Direction FINAL
Trạng thái: USER-APPROVED (gate đóng 09/10) · Áp dụng: SF-3 (session UI) + SF-4 (dashboard)
Lựa chọn của user: **Base A "Vườn ấm"** (tokens + layout tổng) · Garden strip: cây minh họa ground-line (A) · Màn phiên học: card mềm (A) · Surface: **CẢ HAI — sáng mặc định + toggle dark** dùng bảng `.dark` của brand (palette như proto-C).
Source of truth: `docs/superpowers/designs/vocab-memrise/proto-A.html` — ĐÃ có toggle dark minh họa (nút trăng/mặt trời trên chrome, mở trực tiếp được). Mọi giá trị pixel/màu lấy từ file này; `:root` = light, `html.dark` = dark mapping.
Mix note: dark mode KHÔNG phải brand mới — ánh xạ 1-1 bảng `.dark` trong `src/app/globals.css`; các token green/gold/garden là mở rộng (proto-C là nguồn tham khảo gốc).

## 1. Tokens

### 1.1 Light (mặc định — nền tảng "Classroom Warm" hiện có)
| Token | Giá trị | Dùng |
|---|---|---|
| `--bg` | `#fff8f0` | nền app |
| `--bg2` | `#fdf1e2` | nền phụ: slot chờ, ô stats tổng kết, track ring, khối ví dụ |
| `--card` | `#ffffff` | card, option, input |
| `--ink` | `#432818` | text chính |
| `--mut` | `#8a6b52` | text phụ (4.6:1 trên kem) |
| `--line` | `#f3e2ce` | viền card/option |
| `--accent` | `#f9e8d2` | hover nền option |
| `--input` | `#ecd9bf` | viền input gõ từ |
| `--coral` | `#c2482e` | CTA chính + ring mục tiêu + nhấn (4.68:1) |
| `--coral-deep` | `#a83a24` | shadow-đáy nút coral (`box-shadow:0 4px 0`) |
| `--on-coral` | `#fff8f0` | chữ/icon trên coral |
| `--teal` | `#0b756d` | dữ liệu/ôn tập/chip bước (5.27:1) |
| `--teal-soft` | `#e3f0ee` | nền icon teal |
| `--on-teal` | `#ffffff` | chữ trên teal |
| `--teal-deep` | `#084c46` | shadow-đáy nút teal (`0 3px 0`) |
| `--leaf` / `--leaf-deep` / `--leaf-soft` | `#3f8f4f` / `#2e6e3c` / `#e7f1e3` | vườn + feedback đúng (text 5.9:1) |
| `--garden` | `#eef4e4` | band vườn + watermark lá |
| `--gold` / `--gold-bright` | `#b45309` / `#f59e0b` | XP + streak (chữ / icon) |
| `--gold-soft` / `--gold-soft-line` | `#fdf3e0` / `#f4dfb8` | pill XP, viền popover mục tiêu |
| `--red` / `--red-soft` | `#c92f2f` / `#fbe9e9` | feedback sai |
| `--dim` | `#cdb49a` | placeholder, slot chưa tới, note demo |
| `--wave-dim` | `#cfe0e8` | thanh waveform mờ + ground-line cây |
| `--legend-ink` | `#4c6b3c` | chú thích dưới vườn |
| `--ring` | `#f9b48f` | focus-visible outline 3px offset 2 |
| radius | card 20–24 · option/CTA 16 · pill 999 | |
| shadow | card `0 10px 30px rgba(67,40,24,.08)` · nút coral `0 4px 0 var(--coral-deep)` · nút teal `0 3px 0 var(--teal-deep)` | |
| type | **Baloo 2** 700/800 display (h1 27 · từ vựng 38–44 · số stat 21 · XP tổng kết 52) · **Nunito** 400/600/700/800 body 15.5/1.55 · caption ≥12 | |
| level colors `--lv1..7` | `#f59e0b #e85d3d #0e9488 #0284c7 #7c3aed #be185d #111827` | dot + bar lộ trình sách |

### 1.2 Dark mapping (`html.dark` — scope xem §4)
| Token | Light | Dark | Nguồn |
|---|---|---|---|
| `--bg` | `#fff8f0` | `#211711` | `.dark --background` |
| `--bg2` | `#fdf1e2` | `#352718` | `.dark --muted` |
| `--card` | `#ffffff` | `#2b1f16` | `.dark --card` |
| `--ink` | `#432818` | `#f8efe3` | `.dark --foreground` |
| `--mut` | `#8a6b52` | `#c9ac90` | `.dark --muted-foreground` |
| `--line` | `#f3e2ce` | `#43301f` | `.dark --border` |
| `--accent` | `#f9e8d2` | `#3d2c1c` | `.dark --accent` |
| `--input` | `#ecd9bf` | `#4d3823` | `.dark --input` |
| `--coral` | `#c2482e` | `#ff7a50` | `.dark --primary` |
| `--coral-deep` | `#a83a24` | `#b94a2c` | `.dark --primary-deep` |
| `--on-coral` | `#fff8f0` | `#2b1408` | `.dark --primary-foreground` |
| `--teal` | `#0b756d` | `#2dd4bf` | `.dark --secondary` |
| `--teal-soft` | `#e3f0ee` | `#12312e` | mở rộng (nền icon teal tối) |
| `--on-teal` | `#ffffff` | `#062a26` | `.dark --secondary-foreground` |
| `--teal-deep` | `#084c46` | `#0f766e` | mở rộng |
| `--leaf` | `#3f8f4f` | `#5cbf6e` | mở rộng |
| `--leaf-deep` | `#2e6e3c` | `#8fd694` | mở rộng (text xanh trên tối ~10:1) |
| `--leaf-soft` | `#e7f1e3` | `#22331d` | mở rộng |
| `--garden` | `#eef4e4` | `#232e19` | mở rộng (band vườn tối chất moss) |
| `--gold` / `--gold-bright` | `#b45309` / `#f59e0b` | `#fbbf24` / `#fbbf24` | mở rộng |
| `--gold-soft` / `--gold-soft-line` | `#fdf3e0` / `#f4dfb8` | `#3a2c12` / `#4a3212` | mở rộng |
| `--red` / `--red-soft` | `#c92f2f` / `#fbe9e9` | `#f87171` / `#3a1a1a` | `.dark --destructive` + nền mở rộng |
| `--dim` | `#cdb49a` | `#6b543c` | mở rộng |
| `--wave-dim` | `#cfe0e8` | `#2f4a45` | mở rộng |
| `--legend-ink` | `#4c6b3c` | `#a9c79a` | mở rộng |
| `--ring` | `#f9b48f` | `#b45309` | `.dark --ring` (focus-visible) |
| shadow card | `rgba(67,40,24,.08)` | `0 10px 30px rgba(0,0,0,.4)` | |
| pbar/chrome | `rgba(255,248,240,.92)` | `rgba(33,23,17,.92)` | |
| `color-scheme` | light | dark | |

Không đổi theo dark: SVG minh họa cây trong vườn (fill cứng `#3f8f4f/#63ab61/#8a6b52/#d9c49f/#e85d3d/#c2482e/#f59e0b`) — đọc tốt trên band tối. Level 7 `#111827` trên dark → dùng `#334155` cho dot/bar (đã minh họa trong proto).

### 1.3 Chip giai đoạn tăng trưởng (8 stage — ngưỡng ngày do `growth.ts` sở hữu, design chỉ icon + nhãn)
0 Hạt mầm (hạt nâu) · 1 Nảy mầm (mầm 2 lá) · 2 Cây con (2 cặp lá) · 3 Nụ (nụ coral) · 4 Cây non (bụi 3 khối) · 5 Cây xanh (tán tròn) · 6 Trỗi dậy (cây + sparkle vàng) · 7 Nở hoa (hoa 5 cánh coral/gold). Bộ SVG 40×44 inline trong proto-A — copy nguyên vẹn.

## 2. Structure

### 2.1 Dashboard `/vocabulary` (SF-4) — thứ tự khối
1. **Header**: dòng ngày phụ + "Chào {name}" (Baloo 27) + pill tổng XP (ngôi sao gold, nền gold-soft).
2. **Continue card** (hero, radius 24): tag "HỌC TIẾP" teal-soft · tên sách (Baloo 22) · meta "Level N · Từ X–Y — còn k từ mới trong level" · progress 8px teal (planted/10 trong level hiện tại) · CTA coral full-width "Học k từ mới" → `/vocabulary/learn/[book]`. Sách hoàn thành: CTA disabled, tag "Hoàn thành" — không link sang level rỗng. Watermark lá `--garden` opacity .5 góc phải.
3. **Stat row 3 card**: (a) mục tiêu — ring donut 74px coral (dasharray, ví dụ 3/5) + nút "Sửa mục tiêu ▾" mở popover; (b) streak — lửa gold "7 ngày" + chú thích "vocab · dictation đều giữ lửa"; (c) đến hạn — icon refresh teal "12 từ đến hạn ôn tập hôm nay" + nút teal "Ôn ngay" → trang ôn tập.
4. **Garden band** (`--garden`, radius 24): 8 cây SVG trên ground-line (border-bottom 2.5px `--wave-dim`), số đếm Baloo dưới mỗi cây, chú thích tên stage (`--legend-ink`). aria: `role="img"` + label phân bố.
5. **"Lộ trình 7 sách"**: mỗi hàng = dot màu level + "Level N" (+ tên level 1) + chip CEFR + tag trạng thái (Hoàn thành/Đang học/Chưa bắt đầu) + "planted/total" + bar 7px màu level.
6. **"Khám phá"**: 3 dcard ngang (Học theo sách / Quiz từ vựng / Bảng xếp hạng).
Desktop ≥900: cột trái = continue + stat row + khám phá; cột phải = vườn + lộ trình. Lộ trình 1 cột (2 cột đã thử — chật ở 1280).

### 2.2 Learn session `/vocabulary/learn/[book]` (SF-3)
- **Header phiên**: nút back 44px + "Prepare 5 · B1" + "Level 6 · Từ 51–60" + chip "+26 XP" gold (cập nhật live).
- **Progress hạt giống**: 5 slot 44px — done: check `--leaf-deep` trên `--leaf-soft` · active: mầm coral + pulse ring 1.6s (reduced-motion tắt) · chờ: hạt `--dim`. aria-label tổng hợp tiến độ.
- **Screens** (card radius 24, viền `--line`, shadow mềm):
  1. **IntroduceCard**: chip "Hạt mầm" + "Từ mới · 3 bước kiểm tra" · từ Baloo 38 + IPA + pos · nút nghe coral pill (ẩn khi `audioUrl` null) · nghĩa VI đậm · ví dụ trong khối bg2 kèm dịch · CTA "Tiếp tục".
  2. **McStep**: qlabel uppercase · từ + IPA + miniaudio teal · 4 option 52px (pool <4 → render đúng số) · chọn → POST chấm → `.correct` (leaf) / `.wrong` (red) + feedback bar aria-live.
  3. **ListenStep**: nút phát lại teal 58px + waveform (bars `--teal`/`--wave-dim`, aria-hidden) · options như MC · chỉ tồn tại khi từ có audio (server lọc).
  4. **TypeStep**: prompt = nghĩa VI trong ngoặc kép (Baloo 26) · input 52px + nút "Kiểm tra" · Enter submit · 3 trạng thái: đúng / gần đúng (typo ≤1 với từ ≥5 ký tự → vẫn +1 XP) / sai · `autocapitalize=off spellcheck=false`.
  5. **SessionSummary**: "+26 XP" Baloo 52 coral · breakdown "5 từ × 4 XP + 6 bước đúng" · 3 ô stats (từ đã trồng / giai đoạn / Level 10/10) · capnote "26/60 XP hôm nay — XP trong ngày còn được tính" (xpCapped) · CTA "Học Level 7" + ghost "Về dashboard".
- Chú ý: dải chip "DẠO NHANH CÁC MÀN" là **prototype-only** — production KHÔNG render.

### 2.3 State mẫu chuẩn (fixture chung cho SF-3/SF-4 + e2e visual)
5 từ: commute /kəˈmjuːt/ đi làm hằng ngày · luggage /ˈlʌɡɪdʒ/ hành lý · depart /dɪˈpɑːt/ khởi hành (ACTIVE ở MC; options: hành lý / khởi hành✓ / đi làm hằng ngày / tiền hoàn lại) · refund /ˈriːfʌnd/ tiền hoàn lại (type: "tiền hoàn lại" → refund) · scenic /ˈsiːnɪk/ có phong cảnh đẹp. Listen options: deposit / **depart**✓ / deport / report. Tổng kết +26 XP = 5×4 + 6 bước đúng, stage Nảy mầm, Level 6 10/10, cap 26/60.
Dashboard: Chào Minh · Thứ Hai 5 tháng 10 · 1.248 XP · goal 3/5 (preset 5) · streak 7 · due 12 · vườn 96/74/58/34/22/15/8/6 (=313) · sách L1 120/120 Hoàn thành, L2 86/120, L3 41/130, L4 12/110, L5 54/120 Đang học (Level 6 · 51–60 · 5/10), L6 0/115, L7 0/125 Chưa bắt đầu.

## 3. Behavior
- **Popover mục tiêu**: mở từ "Sửa mục tiêu ▾" — popover viền dashed `--gold-soft-line`, preset [5][10][20], preset đang chọn nền teal; chọn → PATCH goal, đóng khi blur/Escape; `aria-expanded` trên nút.
- **Feedback đúng/sai** (server-chấm, payload không chứa đáp án): đúng = banner `--leaf-soft`/`--leaf-deep` + chip "+1 XP" (nền card, XP lần-đầu-ngày; lặp lại không cộng) · sai = `--red-soft`/`--red`, chữ "từ sẽ quay lại cuối hàng phiên này" (requeue client-side) · option đúng enable, cả group disable sau chấm.
- **Progress hạt giống**: slot → done ngay khi từ hoàn thành lượt chấm (mỗi từ đúng 1 lần/lượt; sai → requeue, không rớt stage trong phiên).
- **Motion**: fade-up .5s `cubic-bezier(.22,1,.36,1)` khi đổi step/tab · pulse slot active 1.6s · nút coral :active `translateY(3px)` + shadow co · TẤT CẢ bọc `prefers-reduced-motion` (globals.css đã có rule — giữ nguyên).
- **A11y**: focus-visible 3px `--ring` offset 2 trên mọi interactive · contrast ≥4.5 cho text (coral 4.68, teal 5.27 trên kem; dark: coral #ff7a50 ~7.1, teal #2dd4bf ~9.8) · touch ≥44px (option 52, CTA 54, icon button 44) · feedback bar `aria-live="polite"` · tab order: header → progress (aria) → màn → CTA.

## 4. Dark mode — toggle spec
- **Nút**: icon trăng/mặt trời 40px (border `--line`, nền card), đặt trong header cụm công cụ vocab: trên dashboard (góc phải header trang) và trên header phiên học. `.dark` toggle qua class trên scope.
- **Scope — ĐỀ XUẤT (đã ghi rõ): CHỈ surface vocabulary** (`/vocabulary`, `/vocabulary/learn/[book]`, trang ôn tập). Lý do: app dictation hiện light-only; dark riêng vocab tránh đụng theme engine toàn app (next-themes) trong story này. Implementation: class `dark` scope tại container vocab (CSS descendant `.dark` như proto), KHÔNG ghi theme toàn app; nếu cần persist → localStorage key riêng `ilec.vocab-theme`. Mở rộng toàn app là việc khác — out of scope story này.
- Mapping đầy đủ ở §1.2; minh họa sống trong proto-A (nút trên chrome prototype — chrome là outside production).

## 5. Out of design scope (Dev tự quyết)
- Copy chính xác + i18n keys (gợi ý namespace: `vocab.learn.*`, `vocab.stage.0..7`, `vocab.dash.*` — parity vi/en theo `messages`).
- Độ trễ chuyển step, logic requeue/state machine (SF-2/SF-3 sở hữu).
- Thay SVG inline bằng icon library (giữ hình khối + màu theo §1.3).
- Responsive >1280, admin, heatmap `/me`, behavior audio thật (WordPlayButton/resolveStoredAudioUrl theo touch map SF-3).
- Chrome/brand bar trong prototype ("VU-37 · Hướng A") là khung demo — không dựng lại trong production.

## 6. Nguồn sự thật
- `docs/superpowers/designs/vocab-memrise/proto-A.html` — tokens (`:root` + `html.dark`), structure, behavior ĐỀU lấy từ đây; mở trực tiếp, tab "Phiên học"/"Dashboard", nút trăng/mặt trời đổi mode.
- `src/app/globals.css` — bảng light/dark gốc brand.
- Epic spec §2 UX flows + context packs `sf-3.md`/`sf-4.md` — acceptance criteria thắng design nếu mâu thuẫn (flag coordinator).
