# DB templates + test-data hygiene — SF-1 task 10 (CUỐI)

Date 30-09 · Sau TẤT CẢ task khác (template không stale — P2). Source: DB local `ilec`.

## Cleanup helper — `scripts/cleanup-test-data.ts` (committed)

- Quy ước fixture: `sf{N}-…@test.ilec`. Helper xoá `users WHERE email LIKE '%@test.ilec'` — FK CASCADE verified (`pg_constraint confdeltype='c'`): users → profiles → attempts / daily_activity / user_lesson_progress.
- **DRY-RUN mặc định**; `--yes` mới thực chạy. Không đụng content (pollution e2e admin = SQL FK-order riêng, QA-1) và không đụng admin (`admin@ilec.dev` không khớp pattern).
- Dry-run đo được trên state trước sạch: **users=25 · attempts=49 · progress=19 · daily_activity=19** (tồn dư từ QA session SF-6 VU-15).
- Thực chạy: xoá xong **orphan check 0 hết** (attempts/progress/daily_activity không trỏ profiles nào còn lại).
- Fix trong lúc viết: `db.execute(sql.unsafe())` sai (mixing drizzle execute vs postgres.js fragment) → dùng `sql.unsafe()` trực tiếp.

## Content pollution (lần 2 — từ baseline/audit runs của chính SF-1)

e2e admin runs (task 2 + 7) để lại 3 `E2E Unit` nữa (ids 92/95/98 — numbers 103/106/117) → xoá FK-order trước khi template: 33 parts → 9 lessons → 3 units. Cộng QA-1 (lần 1) = bằng chứng rõ nhất cho SF-4 task "spec e2e re-runnable / self-clean".

## Guard connection + tạo template

- Kill mọi server (next start/dev) → `pg_stat_activity` trên `ilec`: **0 connection** (ngoài session check) — `createdb -T` fail nếu source còn connection (P2 guard).
- `createdb ilec_sf{2..5} -T ilec` — **4/4 OK**.

## State sau hygiene (giống hệt trên 5 DB — verify bằng SQL counts)

| DB | users | units | lessons | attempts | test-users |
|---|---|---|---|---|---|
| ilec (source) | 4 | 14 | 17 | 1 | 0 |
| ilec_sf2 | 4 | 14 | 17 | 1 | 0 |
| ilec_sf3 | 4 | 14 | 17 | 1 | 0 |
| ilec_sf4 | 4 | 14 | 17 | 1 | 0 |
| ilec_sf5 | 4 | 14 | 17 | 1 | 0 |

(4 users = seed demo + `admin@ilec.dev`; 1 attempt = fixture e2e ACCEPTANCE-5; 17 lessons = seed 20 − 3 E2E đã dọn.)

**Re-verify trên DB sạch: `test:rls` 18/18 PASS** — template valid cho SF-2..5 (mỗi SF dùng DB riêng `ilec_sf{N}` + port riêng qua config mới của mình).

## Quy ước cho SF-2..5 (từ context pack + thực tế QA-1)

- Fixture email: `sf{N}-…@test.ilec` — dọn được bằng helper này (đổi DATABASE_URL sang DB mình hoặc chạy trên ilec cuối story).
- Admin e2e tạo content → phải self-clean cuối spec (SF-4 task 1 acceptance) — nếu không, DB riêng của SF cũng dơ chéo run y như ilec đã bị.
