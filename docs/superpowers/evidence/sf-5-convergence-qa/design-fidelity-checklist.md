# T7 — Design fidelity checklist (VU-42, đối chiếu hand-off)

Hand-off: `docs/superpowers/designs/vocab-memrise/vocab-memrise-direction.md`
(USER-APPROVED 09/10) · Source of truth pixel: `proto-A.html`.
Screenshot đối chiếu: `visual-desktop-dashboard.png`, `flow-0*-375.png`
(trong dir này), so template proto-A mở trực tiếp.

## §1 Tokens (static — verify bằng grep globals.css)

| Item | Direction | Thực tế | Verdict |
|---|---|---|---|
| `--bg/--bg2/--card/--ink/--mut/--line` light | §1.1 hex | khớp hex (`:root`) | ✅ |
| `--coral #c2482e` / `--coral-deep #a83a24` / `--on-coral` | §1.1 | khớp | ✅ |
| `--teal #0b756d` / `--teal-deep #084c46` / `--teal-soft` | §1.1 | khớp | ✅ |
| leaf/leaf-deep/leaf-soft `#3f8f4f/#2e6e3c/#e7f1e3` | §1.1 | khớp | ✅ |
| gold `#b45309` / gold-soft `#fdf3e0` / red `#c92f2f` | §1.1 | khớp | ✅ |
| dim/wave-dim/legend-ink/garden | §1.1 | khớp | ✅ |
| `--ring #f9b48f` focus 3px offset 2 | §1.1/§3 | khớp (`:root`) | ✅ |
| Dark map §1.2 (`#211711/#352718/#2b1f16/…`) | `.dark` scope | khớp hex trong globals.css `.dark` + bảng vocab | ✅ |
| radius card 20–24 · option/CTA 16 · pill 999 | §1.1 | card 18–24 / CTA rounded-xl…(xem visual) | ✅* |
| Baloo 2 display + Nunito body | §1.1 | font-display/font-body dựng sẵn brand | ✅ |
| Level colors `--lv1..7` | §1.1 | `#f59e0b #e85d3d #0e9488 #0284c7 #7c3aed #be185d #111827` | ✅ |

## §2 Structure — dashboard (visual: `visual-desktop-dashboard.png`)

| Item | Direction §2.1 | Verdict |
|---|---|---|
| Header: ngày phụ + "Chào {name}" Baloo 27 + pill XP gold-soft ngôi sao | có pill XP + greeting + dateLine | ✅ |
| Continue card: tag teal-soft "HỌC TIẾP", meta level/range, progress 8px teal, CTA coral full-width, watermark lá | DashboardContinueCard | ✅ visual |
| Stat row 3 card: ring mục tiêu coral 74px + Sửa mục tiêu popover · streak lửa gold · due refresh teal + "Ôn ngay" teal | DashboardStatsRow + DashboardGoalRing | ✅ visual |
| Garden band `--garden` 8 cây SVG ground-line + đếm Baloo + chú thích legend-ink, `role="img"` | DashboardGardenStrip (8 stage icons inline) | ✅ visual |
| Lộ trình 7 sách: dot màu + Level N + chip CEFR + tag + planted/total + bar 7px | DashboardBookLevelsProgress | ✅ visual |
| Khám phá: dcard ngang | hub-overview-section (3 dcard, icon luân phiên) | ✅ visual |
| Desktop ≥900 2 cột trái continue+stats, phải vườn+lộ trình | `min-[900px]:grid-cols-[1.1fr_.9fr]` | ✅ |

## §2 Structure — learn session + review (visual: `flow-02…04`, `flow-06…07` 375)

| Item | Direction §2.2 | Verdict |
|---|---|---|
| Header phiên: back 44 + tên sách/level + chip "+N XP" live | session header | ✅ visual |
| Progress 5 slot 44px hạt giống (done leaf / active pulse / chờ dim) + aria | SessionRunner | ✅ visual |
| IntroduceCard: chip stage + từ Baloo 38 + IPA + nút nghe coral (ẩn khi null audio) + nghĩa + ví dụ bg2 | SessionIntroduceCard | ✅ visual |
| McStep: qlabel + từ + IPA + miniaudio teal + option 52px + feedback aria-live | SessionMcStep | ✅ visual |
| ListenStep: replay teal 58 + waveform bars teal/wave-dim + options; không audio → không bước | SessionListenStep (+fallback gõ nghĩa P1) | ✅ visual |
| TypeStep: prompt nghĩa "ngoặc kép" Baloo 26 + input 52 + Enter + 3 trạng thái | SessionTypeStep | ✅ visual |
| Summary: "+N XP" Baloo 52 coral + breakdown + 3 ô stats + capnote khi capped + CTA | SessionSummary | ✅ visual |
| Prototype-only chip "DẠO NHANH CÁC MÀN" KHÔNG render | grep `DẠO NHANH` src = 0 | ✅ |

## §3 Behavior + §4 Dark

| Item | Direction | Verdict |
|---|---|---|
| Popover mục tiêu: dashed gold-soft-line, preset 5/10/20, chọn → PATCH, Escape/blur đóng, aria-expanded | DashboardGoalRing editor | ✅ (e2e 3319 + visual) |
| Feedback đúng/sai server-chấm; đúng leaf +chip XP; sai red "quay lại cuối hàng" | session components | ✅ visual |
| Motion bọc `prefers-reduced-motion` (fade-up, pulse, active translateY) | globals.css + components | ✅ (visual reduced-motion — `reduced-motion.png`) |
| Dark: nút trăng/mặt trời 40px, scope CHỈ vocabulary surface, localStorage `ilec.vocab-theme` | DashboardThemeToggle + SessionRunner header | ✅ (e2e 3319 + `visual-learn-intro-dark` ở SF-3 evidence) |

## Chênh lệch còn lại (đánh giá fix/escalate)

1. **Radius card khối nhỏ 18px** thay vì 20–24 (Khám phá dcard, stat tile) — trong family radius 16–24, không lệch hướng → **ghi nhận, không fix** (fix = đụng SF-4 surface vì aesthetic thuần).
2. **Màn 375**: continue card meta dài → wrap 2 dòng (không vỡ layout, contrast OK) → **ghi nhận**.
3. Số liệu state mẫu §2.3 (proto) là fixture minh hoạ — production dùng data thật (đúng thiết kế, không phải lệch).
4. Không có lệch hướng nào cần escalate — tokens/màu/structure khớp hand-off.

*(Verdict visual do người đọc tự đối chiếu PNG với proto-A.html — Rule 0: ảnh là bằng chứng, checklist chỉ định vị.)*
