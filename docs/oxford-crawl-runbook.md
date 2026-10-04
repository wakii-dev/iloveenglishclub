# Oxford Crawl Runbook — operator guide (VU-32)

> Cho người VẬN HÀNH full crawl Oxford Learner's Dictionaries vào hệ thống.
> Story/kiến trúc: epic VU-32 (SF-1 crawl-core, SF-2 enrich, SF-3 admin UI,
> SF-4 convergence). Số liệu dưới đây là SỐ ĐO THẬT từ rehearsal 100 từ
> (2026-10-04, evidence `docs/superpowers/evidence/sf-4-convergence-public-attribution/`)
> — các chỗ ghi ⚠ là ƯỚC TÍNH, đo lại khi chạy thật lần đầu.

## 1. Chuẩn bị môi trường

```bash
# worktree có migration 0004 (crawl_entries) — kiểm tra:
psql "$DATABASE_URL" -c "select to_regclass('crawl_entries');"

# env: DATABASE_URL + BLOB_READ_WRITE_TOKEN (phase audio) + AUTH_SECRET
vercel link                        # 1 lần (project iloveenglishclub)
vercel env pull --environment development .env.local
# thêm local-only (không có trên Vercel): ADMIN_EMAIL / ADMIN_PASSWORD ≥ 8 ký tự

node --version                     # ≥ 24 (chạy .ts native, strip-only)
```

- **Node24 strip-only**: script chạy native `node scripts/oxford-crawl.ts` —
  KHÔNG dùng parameter properties / import `.ts` trong code path runner.
- Robots.txt được kiểm TỰ ĐỘNG trước mọi run (`assertCrawlAllowed`) — nếu OUP
  Disallow `/definition/english/` → runner exit 1, KHÔNG vòng qua.

## 2. Lệnh chạy (3 phase — dry-run là MẶC ĐỊNH)

```bash
node scripts/oxford-crawl.ts enumerate [--apply]          # sitemap → crawl_entries pending
node scripts/oxford-crawl.ts fetch    [--limit N] [--slug x] [--apply]   # fetch+parse text
node scripts/oxford-crawl.ts audio    [--limit N] [--apply] [--skip-audio]  # mp3 uk/us → Blob
# flags chung: --rate N (mặc định 2 req/s — politeness) · --apply (GHI; thiếu = DRY-RUN)
```

- **DRY-RUN trước khi_apply**: mọi phase không `--apply` chỉ log (enumerate in
  số slugs sẽ upsert; audio `--skip-audio` scan-only). Audit chi phí trước.
- State nằm trong DB (`crawl_entries.status` + `audio_*_blob`) — **kill giữa
  chừng AN TOÀN**: chạy lại tiếp đúng chỗ, không dup (đã chứng minh rehearsal
  T3: kill -9 sau 28s → resume 100/100, 0 dup, 0 sót).
- **Single-runner assumption**: CHỈ 1 runner tại 1 thời điểm (không lock —
  thiết kế documented). Kiểm trước khi chạy: `select count(*) from
  crawl_entries where fetched_at > now() - interval '10 minutes';` = 0.

## 3. Chạy dài: nohup / cron

```bash
# nohup (khuyến nghị — log + pid rõ; path GHI ĐƯỢC bởi user chạy app —
# tránh /var/log, /var/run vì thường root-owned):
mkdir -p /srv/ilec/logs
nohup node scripts/oxford-crawl.ts fetch --limit 5000 --apply \
  >> /srv/ilec/logs/oxford-fetch.log 2>&1 &
echo $! > /srv/ilec/logs/oxford-fetch.pid

# cron: chạy fetch theo khung giờ thấp điểm (mỗi lệnh tự dừng khi hết pending):
# 17 3 * * *  cd /srv/ilec && node scripts/oxford-crawl.ts fetch --limit 5000 --apply >> logs/oxford-fetch.log 2>&1
# 47 4 * * *  cd /srv/ilec && node scripts/oxford-crawl.ts audio --limit 2000 --apply >> logs/oxford-audio.log 2>&1
```

Mỗi run claim tối đa `--limit` rows pending (id tăng dần) — chạy nhiều lần
liên tiếp = progress tuyến tính. Runner log checkpoint mỗi 50 entries.

## 4. Số liệu thật (rehearsal 2026-10-04) & ước tính full crawl

| Chỉ số | Số thật | Nguồn |
|---|---|---|
| Tốc độ fetch | **~1.03 từ/s** (~62 từ/ph) | run 2: 100 entries / 97s |
| Full crawl text-only 63.9k từ | **~17 giờ** (rate 2/s là trần politeness — bottleneck là fetch+DB) | từ tốc độ đo |
| Parse-fail rate | **0/128** (0%) hôm nay | rehearsal |
| Redirect (slug _1 → gốc) | 0/100 | rehearsal |
| DB size / entry parsed | **~1.2 KB** (raw jsonb 709B + cột) → **~75 MB** @ 63.9k | `pg_column_size` |
| Audio Blob | ⚠ ƯỚC TÍNH: ~128k mp3 ≈ 4-6 GB (~35-47KB/mp3, spec §Rủi ro 5) — **chưa đo rehearsal này** (fetch text-only). Đo thật ngay lần `audio --limit 20 --apply` đầu | — |
| Dashboard GET stats @ 63.9k rows | **14.3 ms** in-DB (~2s trên dev server) | EXPLAIN + HTTP timing |
| Enrich batch 200 từ (worst-case 63.9k parsed) | **~0.7 s/chunk** (1 seq-scan/batch — không per-word) | EXPLAIN |

Khuyến nghị vận hành: chia full crawl thành nhiều đêm (fetch --limit 5000/đêm
≈ 1.5h/đêm ≈ 14 đêm) — robots-friendly và dễ theo dõi failed.

## 5. Theo dõi

- **Dashboard**: `/admin/vocabulary/crawl` — counts theo status, failed
  samples (≤20 slug + last_error), refresh-sitemap, retry-failed, hint lệnh.
- **Parse-fail tăng bất thường** (vd >5%) = Oxford đổi HTML — dừng, cập nhật
  `src/lib/oxford/parse.ts` selector (fixtures là contract test).
- Logs: checkpoint mỗi 50 (`parsed X, failed Y, redirect Z`) + tổng kết cuối
  run + `[crawl_entries] pending=… parsed=… failed=…`.

## 6. Kill-switch (OUP yêu cầu dừng / sự cố)

```bash
# 1. TẮT runner: kill pid (an toàn giữa chừng — state trong DB) + gỡ cron
kill $(cat /var/run/oxford-fetch.pid)

# 2. XOÁ data crawl (toàn bộ entry) — REVIEW TRƯỚC KHI COMMIT (bulk delete
#    vĩnh viễn): chạy trong transaction, nhìn count rồi mới commit:
psql "$DATABASE_URL" -c "BEGIN; SELECT count(*), pg_size_pretty(pg_total_relation_size('crawl_entries')) FROM crawl_entries;"
#    (kiểm số liệu đúng như kỳ vọng — rồi mới:)
psql "$DATABASE_URL" -c "BEGIN; DELETE FROM crawl_entries; -- kiểm affected rows -- COMMIT;"
#    rollback nếu sai: thay COMMIT bằng ROLLBACK;
#    (words đã enrich/crawl-on-add có words.source='oxford-ld' giữ nguyên —
#     là data đã vào books; xoá riêng nếu OUP yêu cầu: delete words where source='oxford-ld')

# 3. XOÁ audio Blob prefix:
#    xoá các object prefix `audio/oxford/` trên Blob store (dashboard storage
#    hoặc vercel blob CLI). `npm run audio:sync` KHÔNG kéo prefix này vào git.

# 4. robots.txt của OUP đã Disallow → runner tự chặn mọi run sau (exit 1).
```

## 7. Enrich sau crawl (điền vào words)

Dashboard → chọn book → "Điền dữ liệu thiếu từ Oxford": dryRun counts trước →
apply (cap 200 từ/chunk, fill-empty — KHÔNG đụng field teacher đã có,
`words.source='oxford-ld'` chỉ khi có fill, revalidate public ngay).
Toàn bộ route crawl đều assertAdmin (không public).

## 8. Cấu hình liên quan (đừng đổi bừa)

- `RETRY_ATTEMPTS_CAP = 5` (failed quá cap không tự retry — dashboard hiện riêng)
- Enrich cap 200 từ/chunk · refresh-sitemap delta cap 2000 · crawl-on-add
  audio = ngoại lệ 1 mp3 UK qua helper blob-only
- Rate mặc định 2 req/s — 1 token bucket chung fetch+audio
