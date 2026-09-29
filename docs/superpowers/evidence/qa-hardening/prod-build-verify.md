# Prod-build verify — SF-1 task 3

Build: `npm run build` exit 0 (không turbopack — sau `4d95320`) · Serve: `next start` PORT=3300 ("Ready in 344ms")
Storage split `3617eed` hoạt động: `/api/admin/upload` (server) build OK, client bundle không kéo `@vercel/blob` (test chặn cứng ở task 4).

## Smoke 3 tầng (Rule 0) — TỰ NHÌN bằng screenshot

| Trang | HTTP | H1 thực thấy | Audio | Dev indicator | Console errors |
|---|---|---|---|---|---|
| `/en` | 200 | "Master English listening, one sentence at a time" | — | **0** (prod xác nhận) | 0 |
| `/vi` | 200 | "Nghe thật kỹ. Gõ lại thật đúng." | — | **0** | 0 |
| `/vi/books/level-3/units/1/lessons/1/listen-and-type` | 200 | "Từ vựng — Hoạt động thời gian rảnh" | 2 element | **0** | 0 |

- **Guard dev-indicator**: DOM query `[data-nextjs-dev-tools-button], nextjs-portal` = 0 trên cả 3 trang + screenshot không thấy nút dev tools → **đây là prod build thật, không phải dev**.
- **FLOW (chuẩn đo)**: click "Bắt đầu" → player mở thật: audio PLAYING (0:02/0:03, waveform, nút pause), tabs Chính tả/Toàn bộ bài đọc, toggle Khắt khe, "+0 XP chưa lưu" (guest — đúng thiết kế), Phần 1/4 + nav ‹ ›, textarea input, Bỏ qua/Gợi ý/Kiểm tra. Screenshot: `prod-smoke/lesson-player-vi.png`.
- **Audio local driver**: DB `audio/level-3/unit-1/lesson-1/01.mp3` → GET `/audio/.../01.mp3` = **200 (10800 bytes)** — playback có file thật.

Screenshots (pixel-real, human-reviewed): `prod-smoke/home-en.png` · `home-vi.png` · `lesson-vi.png` · `lesson-player-vi.png`.

## Kết luận task 3

Prod build + start + smoke ĐẠI trên HEAD. Không blocker cho việc deploy branch story sau này (SF-6).
