CREATE TABLE "quest_completions" (
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"quest_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_completions_user_id_date_quest_id_pk" PRIMARY KEY("user_id","date","quest_id")
);
--> statement-breakpoint
CREATE TABLE "shield_grants" (
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shield_grants_user_id_month_pk" PRIMARY KEY("user_id","month")
);
--> statement-breakpoint
CREATE TABLE "streak_freezes" (
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "streak_freezes_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" text NOT NULL,
	"badge_id" text NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_badge_id_pk" PRIMARY KEY("user_id","badge_id")
);
--> statement-breakpoint
ALTER TABLE "daily_activity" ADD COLUMN "listen_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "daily_goal_minutes" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "shield_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quest_completions" ADD CONSTRAINT "quest_completions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shield_grants" ADD CONSTRAINT "shield_grants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_freezes" ADD CONSTRAINT "streak_freezes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill listen_ms (daily-journey epic VU-48 spec §3.1 — rule PINNED):
-- cho mỗi (user_id, part_id, VN-day) có ≥1 attempt ANY → cộng
-- coalesce(duration_ms, 0) ĐÚNG 1 lần vào daily_activity.listen_ms của
-- (user, day); row chưa có thì TẠO (chỉ listen_ms — parts_done/presence
-- giữ nguyên). VN-day biểu thức giống write-path submit-attempt:
-- (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date. DISTINCT trước khi
-- cộng để part có N attempt trong ngày vẫn góp 1 lần; JOIN lesson_parts
-- lấy duration tại thời điểm backfill.
INSERT INTO "daily_activity" ("user_id", "date", "listen_ms")
SELECT d.user_id, d.vn_day, SUM(COALESCE(p.duration_ms, 0))::int AS listen_ms
FROM (
  SELECT DISTINCT a.user_id, a.part_id,
    (a.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS vn_day
  FROM "attempts" a
) d
JOIN "lesson_parts" p ON p.id = d.part_id
GROUP BY d.user_id, d.vn_day
ON CONFLICT ("user_id", "date") DO UPDATE
SET "listen_ms" = "daily_activity"."listen_ms" + EXCLUDED."listen_ms";
