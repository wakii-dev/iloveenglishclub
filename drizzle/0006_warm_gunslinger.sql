DROP VIEW "public"."leaderboard";--> statement-breakpoint
CREATE VIEW "public"."leaderboard" AS (
  SELECT 'weekly'::text AS scope, t.display_name, t.avatar_url,
         SUM(t.xp)::int AS xp
  FROM (
    SELECT p.id, p.display_name, p.avatar_url, a.xp
    FROM profiles p
    JOIN attempts a ON a.user_id = p.id
      AND (a.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
        >= date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
    UNION ALL
    SELECT p.id, p.display_name, p.avatar_url, va.xp
    FROM profiles p
    JOIN vocab_activity va ON va.user_id = p.id
      AND (va.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
        >= date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')
  ) t
  GROUP BY t.id, t.display_name, t.avatar_url
  UNION ALL
  SELECT 'all_time'::text AS scope, p.display_name, p.avatar_url, p.xp
  FROM profiles p
  WHERE p.xp > 0
);