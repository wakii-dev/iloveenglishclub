# Convergence pack — Vocabulary Module — ILEC

Sinh: 2026-10-03T12:36:33.494Z

## SF

- sf-1 [done] Schema + admin CRUD + bulk import + audio upload
- sf-2 [done] Trang vocabulary theo book (public i18n) + phát audio
- sf-3 [done] Flashcards + SRS review flow (me/vocabulary)
- sf-4 [done] Quiz + điểm + tích hợp top-users
- sf-5 [pending] Tra từ bấm-từ trong nội dung sách

## Tasks (tất cả done)
- t-1.1 [done] schema Drizzle: words/book_words/user_word_progress/quiz_attempts + RLS + migration
- t-1.2 [done] admin API CRUD + bulk import CSV/JSON (validate)
- t-1.3 [done] admin UI quản lý từ theo book + upload audio (Blob + mirror)
- t-1.4 [done] tests: unit + RLS + e2e admin
- t-2.1 [done] trang (public)/[locale]/books/[bookId]/vocabulary i18n vi/en
- t-2.2 [done] phát audio từ (nút ẩn khi chưa có)
- t-2.3 [done] tests + e2e
- t-3.1 [done] SRS engine SM-2 lite (ease/interval/due_at) + submit API
- t-3.2 [done] flashcards + review flow UI (me/vocabulary, due-today)
- t-3.3 [done] tests + e2e review
- t-4.1 [done] quiz engine MC/điền/ghép + chấm điểm API
- t-4.2 [done] quiz UI + tổng kết điểm
- t-4.3 [done] tích hợp top-users
- t-4.4 [done] tests + e2e quiz
- t-5.1 [pending] lookup API exact-match từ DB nội bộ
- t-5.2 [pending] bấm-từ trong nội dung sách → popover nghĩa/IPA/audio
- t-5.3 [pending] tests + e2e lookup

## Bằng chứng (trong 15+ commit branch vocabulary-module)

- vitest tích luỹ: 307 → 350 → 396 → 423/423 xanh (mỗi SF gate typecheck+lint)

## Việc của user sau duyệt DONE

- Áp migration 0002 lên DB (drizzle-kit migrate) → 5 suite e2e vocabulary chạy được hit/miss
- Merge vocabulary-module → master theo luồng Vercel hiện có
