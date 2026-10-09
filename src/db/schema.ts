import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  pgView,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

/**
 * Bảng chuẩn Auth.js (Drizzle adapter) — session strategy JWT nên
 * `sessions`/`verification_tokens` không dùng trong flow chính nhưng
 * giữ schema đầy đủ để adapter hoạt động đúng mọi code path.
 */
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  // bcrypt hash — chỉ dùng bởi Credentials provider (đăng ký email/password)
  passwordHash: text("password_hash"),
});

export const accounts = pgTable(
  "accounts",
  {
    // Property names giữ SNAKE_CASE đúng schema chính thức @auth/drizzle-adapter
    // (adapter query theo tên property — camelCase sẽ lệch type + SQL)
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ],
);

/**
 * profiles — spec §4 đầy đủ (SF-2 bổ sung xp/streak/last_active_date).
 * - locale: auto-set theo route khi đăng ký email (spec §8)
 * - role: gate /admin (middleware chặn chưa-login; layout re-check DB)
 * - xp/streak/last_active = CACHE; source of truth là attempts + daily_activity
 * - Tạo row: KHÔNG dùng DB trigger (sẽ double-insert vỡ registerAction đã
 *   insert profiles trong transaction — deviation ghi trên epic VU-15) mà qua
 *   `events.createUser` (auth.ts, cover OAuth) + register action (cover email).
 */
export const profiles = pgTable("profiles", {
  id: text("id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  locale: text("locale", { enum: ["en", "vi"] }).notNull().default("en"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  relaxedMode: boolean("relaxed_mode").notNull().default(false),
  xp: integer("xp").notNull().default(0),
  streakCount: integer("streak_count").notNull().default(0),
  lastActiveDate: date("last_active_date"),
  // vocab-memrise SF-1 (VU-38): mục tiêu từ mới/ngày — dashboard goal ring
  // đọc, UI chỉnh inline presets 5/10/20 (SF-4 sở hữu surface)
  dailyGoalWords: integer("daily_goal_words").notNull().default(5),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Content model — spec §4. Books là seed data cố định 7 dòng (id 1–7,
 * chỉnh qua migration, không CRUD trong v1 admin).
 * title_vi/desc_vi nullable — fallback render chain vi→en→raw (spec §8);
 * title_en bắt buộc (publish validation).
 */
export const books = pgTable("books", {
  id: integer("id").primaryKey(), // 1–7 theo bảng §2
  slug: text("slug").notNull().unique(), // level-1..level-7 — contract cho footer links
  titleEn: text("title_en").notNull(),
  titleVi: text("title_vi"),
  cefrLabel: text("cefr_label").notNull(),
  examTarget: text("exam_target"),
  descEn: text("desc_en"),
  descVi: text("desc_vi"),
  color: text("color").notNull(), // hex theo design hand-off §1.7
  sortOrder: integer("sort_order").notNull(),
});

export const units = pgTable(
  "units",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    number: integer("number").notNull(), // số thứ tự theo mục lục sách
    titleEn: text("title_en").notNull(),
    titleVi: text("title_vi"),
    descEn: text("desc_en"),
    descVi: text("desc_vi"),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (unit) => [
    unique("units_book_id_number_unique").on(unit.bookId, unit.number),
    index("units_book_id_idx").on(unit.bookId),
  ],
);

export const vocabLevelEnum = pgEnum("vocab_level", [
  "Pre-A1",
  "A1",
  "A2",
  "A2+",
  "B1",
  "B1+",
  "B2",
  "B2+",
]);

export const lessons = pgTable(
  "lessons",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    unitId: integer("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    titleEn: text("title_en").notNull(),
    titleVi: text("title_vi"),
    // v1 chỉ có 'dictation' — text + default thay pgEnum để thêm kind sau
    // không phải migrate enum
    kind: text("kind").notNull().default("dictation"),
    vocabLevel: vocabLevelEnum("vocab_level").notNull(),
    sortOrder: integer("sort_order").notNull(),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (lesson) => [
    unique("lessons_unit_id_number_unique").on(lesson.unitId, lesson.number),
    index("lessons_unit_id_idx").on(lesson.unitId),
  ],
);

export const lessonParts = pgTable(
  "lesson_parts",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    // câu tiếng Anh — transcript (public read là chấp nhận có chủ đích, §4)
    text: text("text").notNull(),
    audioPath: text("audio_path"), // nullable — draft chưa upload
    durationMs: integer("duration_ms"), // nullable — fail mềm, không block
  },
  (part) => [
    unique("lesson_parts_lesson_id_sort_order_unique").on(
      part.lessonId,
      part.sortOrder,
    ),
    index("lesson_parts_lesson_id_idx").on(part.lessonId),
  ],
);

/**
 * attempts — XP ghi bởi service-role action phía server (SF-6).
 * - xp: real theo spec (attempts sau attempt đầu của part có xp = 0 — chống farm)
 * - client_attempt_id: uuid client sinh, UNIQUE(user, part, client_attempt_id)
 *   chặn double-submit
 * - part_id RESTRICT: admin không xóa part đã có người học (quyết định #15 —
 *   gỡ bài bằng unpublish lesson)
 */
export const attempts = pgTable(
  "attempts",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    partId: integer("part_id")
      .notNull()
      .references(() => lessonParts.id, { onDelete: "restrict" }),
    typedText: text("typed_text").notNull(),
    accuracy: real("accuracy").notNull(), // 0–1, mẫu số là transcript (§5)
    wpm: real("wpm").notNull(),
    xp: real("xp").notNull(),
    clientAttemptId: uuid("client_attempt_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (attempt) => [
    unique("attempts_user_part_client_unique").on(
      attempt.userId,
      attempt.partId,
      attempt.clientAttemptId,
    ),
    index("attempts_user_id_idx").on(attempt.userId),
    index("attempts_part_id_idx").on(attempt.partId),
  ],
);

export const userLessonProgress = pgTable(
  "user_lesson_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    doneParts: integer("done_parts").notNull().default(0),
    // KHÔNG snapshot total_parts — tính live từ lesson (tránh lệch khi admin
    // sửa lesson sau khi học viên đã học — §4)
    bestAccuracy: real("best_accuracy"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (progress) => [
    primaryKey({ columns: [progress.userId, progress.lessonId] }),
    index("user_lesson_progress_lesson_id_idx").on(progress.lessonId),
  ],
);

export const dailyActivity = pgTable(
  "daily_activity",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // date theo TZ Asia/Ho_Chi_Minh (quyết định #13) — mode string cho i18n-àn
    date: date("date", { mode: "string" }).notNull(),
    partsDone: integer("parts_done").notNull().default(0),
    // vocab-memrise SF-1 (VU-38): số bước test vocab đã chấm trong ngày —
    // upsert cùng row với dictation: presence row là thứ giữ streak
    vocabSteps: integer("vocab_steps").notNull().default(0),
  },
  (activity) => [
    primaryKey({ columns: [activity.userId, activity.date] }),
  ],
);

/**
 * leaderboard — SQL view (spec §4): xp tuần ISO Mon–Sun TZ Asia/Ho_Chi_Minh
 * (từ attempts.xp) + all-time (từ profiles.xp). CHỈ expose display_name +
 * avatar_url + xp (+ scope phân biệt 2 bảng xếp hạng) — không id/email.
 * date_trunc('week', ...) bắt đầu thứ 2 = đúng ISO Mon–Sun.
 */
export const leaderboard = pgView("leaderboard", {
  scope: text("scope").notNull(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  xp: integer("xp").notNull(),
}).as(sql`
  SELECT 'weekly'::text AS scope, p.display_name, p.avatar_url,
         SUM(a.xp)::int AS xp
  FROM profiles p
  JOIN attempts a ON a.user_id = p.id
    AND (a.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
      >= date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
  GROUP BY p.id, p.display_name, p.avatar_url
  UNION ALL
  SELECT 'all_time'::text AS scope, p.display_name, p.avatar_url, p.xp
  FROM profiles p
  WHERE p.xp > 0
`);

/**
 * Vocabulary module — story vocabulary-module SF-1.
 *
 * Authz = app-level (chuẩn dự án sau pivot VU-15: KHÔNG dùng Postgres RLS —
 * assertAdmin ở write path + query user-scope theo session; contract test ở
 * scripts/test-rls.test.ts). words là content dùng chung (admin ghi, public
 * đọc) — unique word chặn trùng khi bulk import; audioUrl lưu URL đầy đủ
 * (Vercel Blob CDN, cùng pattern persistedAudioPath SF-8).
 */
export const words = pgTable("words", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  word: text("word").notNull(),
  ipa: text("ipa"), // nullable — không phải mọi từ có phiên âm
  meaningVi: text("meaning_vi").notNull(),
  example: text("example"),
  audioUrl: text("audio_url"), // nullable — nút phát ẩn khi chưa upload (t-2.2)
  // Oxford crawl (VU-32 SF-1 — additive, SF-2 fill): cefr = level thô A1–C2
  // (KHÔNG map enum vocab_level — hai thang khác nhau); source = 'oxford-ld'
  // khi enrich fill ≥1 field (null = teacher tạo thuần).
  cefr: text("cefr"),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (word) => [unique("words_word_unique").on(word.word)]);

/**
 * crawl_entries — data lake Oxford Learner's Dictionaries (VU-32 SF-1).
 * Tách lớp với `words` (curated — teacher-owned): crawl KHÔNG BAO GIỜ tạo
 * row words; enrich (SF-2) đọc từ đây để fill-empty.
 * - slug UNIQUE từ sitemap; sau redirect lưu slug CUỐI (tree_1 → tree = 1 row).
 * - word (headword) NULLABLE — null khi pending (chưa parse); UI hiển thị
 *   COALESCE(word, pretty(slug)).
 * - raw jsonb = object cấu trúc (scalar + senses + idioms/phrasals) — KHÔNG
 *   nhét HTML gốc (~98KB/entry).
 * - status machine 3 trạng thái bền: pending → parsed | failed (fetch+parse
 *   nguyên tử — KHÔNG có trạng thái 'fetched' riêng). Single-runner
 *   assumption (không lock/claim — chỉ 1 runner tại 1 thời điểm).
 * - audio_uk/us_url = provenance URL mp3 gốc; audio_uk/us_blob = URL Blob sau
 *   khi tải (prefix audio/oxford/, qua helper blob-only — throw khi thiếu token).
 * - word_idx: enrich match per-word không seq-scan 60k rows mỗi request.
 */
export const crawlEntries = pgTable("crawl_entries", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  slug: text("slug").notNull().unique(),
  word: text("word"),
  source: text("source").notNull().default("oxford-ld"),
  raw: jsonb("raw"),
  ipaUk: text("ipa_uk"),
  ipaUs: text("ipa_us"),
  audioUkUrl: text("audio_uk_url"),
  audioUsUrl: text("audio_us_url"),
  audioUkBlob: text("audio_uk_blob"),
  audioUsBlob: text("audio_us_blob"),
  pos: text("pos"),
  cefr: text("cefr"),
  ox3000: boolean("ox3000").notNull().default(false),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (entry) => [
  index("crawl_entries_status_idx").on(entry.status),
  index("crawl_entries_word_idx").on(entry.word),
]);

/**
 * book_words — gắn word vào book với thứ tự học (cột "order" — SQL reserved,
 * Drizzle quote tự động). PK (book, word): 1 word xuất hiện 1 lần/book;
 * unique (book, order): thứ tự ổn định — insert order = max+1 trong
 * transaction (cùng pattern lessons.number). word_id cascade: xoá word dọn
 * sạch assignment; book_id cascade: books là seed cố định nên không xảy ra.
 */
export const bookWords = pgTable(
  "book_words",
  {
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    wordId: integer("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
  },
  (bw) => [
    primaryKey({ columns: [bw.bookId, bw.wordId] }),
    unique("book_words_book_id_order_unique").on(bw.bookId, bw.order),
    index("book_words_word_id_idx").on(bw.wordId),
  ],
);

/**
 * user_word_progress — SRS SM-2 lite (SF-3 đọc/ghi):
 * - ease khởi điểm 2.5 (chuẩn SM-2), interval_days 0 = chưa review
 * - due_at default now(): word mới thêm vào progress là đến hạn ngay
 * - reps = số lần review thành công; lastReviewedAt nullable (chưa review)
 * - due-today query (SF-3) phủ bởi index (user_id, due_at)
 */
export const userWordProgress = pgTable(
  "user_word_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    wordId: integer("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    ease: real("ease").notNull().default(2.5),
    intervalDays: integer("interval_days").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    reps: integer("reps").notNull().default(0),
    // vocab-memrise SF-1 (VU-38): số lần quên (grade q<3) — seed sắp xếp
    // "khó" phía sau, không đụng SM-2 engine
    lapses: integer("lapses").notNull().default(0),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  },
  (progress) => [
    primaryKey({ columns: [progress.userId, progress.wordId] }),
    index("user_word_progress_user_id_due_at_idx").on(
      progress.userId,
      progress.dueAt,
    ),
  ],
);

/**
 * quiz_attempts — kết quả quiz theo book (SF-4):
 * - mode: text thay pgEnum (pattern lessons.kind — thêm mode không migrate)
 * - score 0–1 (real, cùng thang attempts.accuracy)
 * - detailJson: chi tiết từng câu (jsonb — shape SF-4 sở hữu, không ràng buộc
 *   schema-level để không khoá evolution)
 * - book_id nullable (SF-3 t-3.2, migration 0003): quiz tổng hub scope
 *   all/multi không thuộc 1 book — topQuizScores chỉ group theo user, không
 *   đọc book_id
 */
export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    bookId: integer("book_id").references(() => books.id, {
      onDelete: "cascade",
    }),
    mode: text("mode").notNull(),
    score: real("score").notNull(),
    detailJson: jsonb("detail_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (attempt) => [
    index("quiz_attempts_user_id_idx").on(attempt.userId),
    index("quiz_attempts_book_id_idx").on(attempt.bookId),
  ],
);

/**
 * vocab_activity — source-of-truth XP vocab (vocab-memrise SF-1, VU-38; spec
 * epic §3/E2). Ghi MỌI event chấm (kể cả sai, xp=0) — audit completeness +
 * phục vụ check "lần-đầu-trong-ngày" trong transaction (spec §4).
 * - kind: 'learn-complete' (từ mới reps 0→1, 4 XP lần đầu) | 'session-step'
 *   (bước test learn/review, 1 XP lần đúng đầu trong ngày)
 * - idempotency_key UNIQUE `${userId}:${sessionKey}:${wordId}:${stepIndex}:
 *   ${attemptNo}` — server derive, duplicate submit trả kết quả cached KHÔNG
 *   ghi SRS lần 2 (ON CONFLICT DO NOTHING)
 * - profiles.xp là CACHE write-through; leaderboard weekly đọc 2 nguồn
 *   UNION ALL (migration 0006) nên hết divergence weekly/all_time
 * - index (user_id, created_at): count XP hôm nay trong transaction;
 *   (user_id, word_id): check lần-đầu-correct-today per word
 */
export const vocabActivity = pgTable(
  "vocab_activity",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    wordId: integer("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'learn-complete' | 'session-step'
    correct: boolean("correct").notNull(),
    xp: integer("xp").notNull(),
    sessionKey: text("session_key").notNull(),
    stepIndex: integer("step_index").notNull(),
    attemptNo: integer("attempt_no").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (activity) => [
    check(
      "vocab_activity_kind_check",
      sql`${activity.kind} in ('learn-complete', 'session-step')`,
    ),
    index("vocab_activity_user_id_created_at_idx").on(
      activity.userId,
      activity.createdAt,
    ),
    index("vocab_activity_user_id_word_id_idx").on(
      activity.userId,
      activity.wordId,
    ),
  ],
);
