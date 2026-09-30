# Prod cleanup dry-run — SF-6 (task 8, pha chuẩn bị)

- **Chạy:** 30-09-2026, `node scripts/qa-prod-cleanup.mjs` (KHÔNG `--execute` — DRY-RUN mặc định,
  chỉ SELECT). DB: Neon prod (`ep-delicate-morning-…neon.tech`, db `neondb`) từ `.env.local` worktree
  chính — dùng có chủ đích cho task prod này theo GAP-ANSWER partial coordinator (comment epic 21:04
  29-09); KHÔNG in secret, script chỉ log tên DB.
- **Output:** `/tmp/sf6-prod-dryrun.log` (đính kèm số dưới).

## Pha (a) DB — thứ tự FK: attempts → progress → daily_activity → parts → lessons → units → users

| Bucket | Số lượng |
|---|---|
| users `@test.ilec` | **0** |
| attempts (của test users) | 0 |
| lessons `[QA*]` (trực tiếp + con unit `[QA*]`) | **0** |
| units `[QA*]` | 0 |
| lesson_parts (thuộc lessons `[QA*]`) | 0 |
| progress (của test users / trên lessons `[QA*]`) | 0 / 0 |
| daily_activity (của test users) | 0 |
| attempts (trên parts `[QA*]`, mọi user) | 0 |

**Kết luận: prod DB SẠCH — 0 data test.** Khớp xác nhận của coordinator (comment 21:04:
"verify prod sạch sau lần chạy nhầm — 0 users/attempts mới trong 2h") + đây là đo fresh
30-09 sau khi toàn bộ flow local SF-6 đã chạy xong (không có tác động prod nào xảy ra từ đó).
Không cần `--execute` pha a — không có gì để xoá.

## Pha (b) Vercel Blob

- **SKIP** — `BLOB_READ_WRITE_TOKEN` không có trong env (GAP #3d chưa trả lời).
- Script design DB-driven (audio_path của content `[QA*]` đọc từ DB trước khi xoá DB) +
  lớp phụ list prefix `[QA`. Khi có token: chạy lại dry-run → review → `--execute --phase b`.
- **Liệt kê rõ cái còn (AC):** Blob chưa kiểm được — rủi ro orphan CHỈ phát sinh khi có
  upload audio cho content `[QA]` trên prod; hiện 0 lessons `[QA*]` trên prod DB → KHÔNG có
  audio `[QA]` tồn dư theo design path (`audio/{book}/{unit}/{lesson}/NN.mp3` gắn lesson id).
  Orphan có thể có chỉ nếu upload dở dang bị abort giữa publish — cần token để list xác nhận.

## Lệnh khi GAP #3 đủ (tham khảo — KHÔNG chạy trong run này)

```
BLOB_READ_WRITE_TOKEN=<token> DATABASE_URL=<prod> node scripts/qa-prod-cleanup.mjs            # dry-run cả 2 pha
# review output → chỉ khi 0 bất ngờ:
BLOB_READ_WRITE_TOKEN=<token> DATABASE_URL=<prod> node scripts/qa-prod-cleanup.mjs --execute --phase b
```
