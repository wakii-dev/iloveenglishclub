# SF-6 Context Pack — Progress + Gamification

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-28-iloveenglishclub-design.md` — **§4 Tính XP + §7 Gamification là contract**. Bracket: `docs/superpowers/brackets/vu15-iloveenglishclub.md`.

## Spec slice (chỉ phần SF-6 chịu trách nhiệm)

1. **Server Action submit-attempt (§4):** client chỉ gửi `typed_text` + `client_attempt_id` (trust boundary — KHÔNG tin accuracy/xp client); server recompute bằng pure module SF-3; chạy service-role client phía server trong MỘT transaction: (1) insert attempt — unique (user,part,client_attempt_id) chặn double-submit; (2) attempt ĐẦU của part → `update profiles set xp = xp + $1` single statement atomic; (3) upsert `daily_activity` `ON CONFLICT parts_done = parts_done + $1`; (4) recompute streak từ daily_activity (source of truth), ghi cache profiles
2. **Streak (§4):** TZ CỐ ĐỊNH Asia/Ho_Chi_Minh; hôm qua → +1, hôm nay → giữ, khác → reset 1; **unit test 3 case này** (plan-critic P2)
3. **XP chỉ attempt đầu của part** (attempts sau log đủ, xp=0 — chống farm); modifiers hint×0.8 relaxed×0.5 đã tính trong pure module
4. **Progress upsert** `user_lesson_progress` (done_parts — skip không tính, best_accuracy; KHÔNG total_parts snapshot — tính live)
5. **Leaderboard view đã có (SF-2)** — tuần ISO Mon–Sun TZ Asia/Ho_Chi_Minh từ attempts.xp + all-time profiles.xp; trang `/top-users`: 2 bảng (tuần + all-time), hiện avatar + display_name + xp
6. **Trang `/me`:** tổng parts done, accuracy TB, **tổng phút nghe = sum duration DISTINCT parts đã nghe** (làm lại không đếm kép — join attempts×parts distinct), heatmap 12 tuần từ daily_activity, tiến độ từng book (% lessons done, **yêu cầu 0 skipped**)
7. **Guest login giữa chừng (§5.8):** in-memory results (store SF-4) được commit như user thường khi login xong — submit batch qua cùng action
8. **Wire vào player UI SF-4:** sau mỗi check (user đã login) gọi submit action; XP header live từ profiles; guest vẫn in-memory + banner (SF-4 đã làm UI, SF-6 wire persist)
9. **E2E progress (Playwright):** guest → học dở → login giữa chừng → điểm commit + leaderboard đúng (plan-critic P1 tách khỏi SF-4)

## Touch map (files SF-6 tạo/sở hữu)

```
src/lib/actions/submit-attempt.ts (server action + service-role transaction)
src/lib/gamification/* (streak logic, leaderboard queries, stats queries)
src/app/[locale]/top-users/page.tsx
src/app/[locale]/me/page.tsx
src/components/gamification/* (heatmap, leaderboard-table, stats-cards, streak-badge header)
messages/{en,vi}/gamification.json
playwright tests: e2e/progress.spec.ts
```
READ-ONLY: schema (SF-2), `lib/dictation/store` (SF-3/4 — đọc kết quả in-memory khi commit; sửa player UI tối thiểu chỉ để wire nút submit → flag coordinator nếu phải sửa logic), `components/ui`

## ACCEPTANCE (user-visible)

- Đăng nhập, học 1 bài → DB có attempts + xp đúng + daily_activity + streak đúng; học LẠI cùng part → XP KHÔNG tăng (log only)
- Header hiện streak + XP; /top-users có 2 bảng tuần/all-time đúng số liệu
- /me: heatmap tô đúng ngày có học; tổng phút nghe không đếm kép; book progress % đúng (lesson có skip không tính)
- Guest học 5 câu → login giữa chừng → 5 câu có điểm, không mất
- Nhấn Enter đôi nhanh → chỉ 1 attempt được ghi (unique constraint)

## Boundary (KHÔNG làm)

- KHÔNG sửa logic/state machine player SF-4 (chỉ wire call submit + nhận kết quả)
- KHÔNG SEO metadata trang top-users/me (SF-7), KHÔNG admin (SF-5)
- KHÔNG đổi schema — thiếu gì flag coordinator
- Merge convention (song song với SF-7): sau merge regen lockfile, không resolve tay
