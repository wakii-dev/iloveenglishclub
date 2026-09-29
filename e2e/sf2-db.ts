import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB helper SF-2 (DB riêng `ilec_sf2` — context pack qa-hardening/sf-2).
 * Lesson scoring-edge number 99 dưới L3-U1: các câu edge (apostrophe cong,
 * decimal, NFC accents, dấu câu biên) mà seed demo không có — insert
 * idempotent từ globalSetup (TRƯỚC lần query đầu — unstable_cache `content`
 * revalidate 300 sẽ cache kết quả tìm thấy và serving ổn định vì fixture
 * bất biến; ĐỔI CÂU → bump number 99→100 hoặc xóa .next/cache).
 * Guest-only tests → 0 attempts rows → teardown xóa sạch (RESTRICT không vướng).
 */
dotenv.config({ path: ".env.local" });

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

export const SCORING_LESSON_NUMBER = 99;
export const SCORING_LESSON_URL = `/en/books/level-3/units/1/lessons/${SCORING_LESSON_NUMBER}/listen-and-type`;
export const SCORING_LESSON_TITLE = "QA-SF2 scoring edges";

/** Transcript fixture — ghi chú edge từng câu trong dictation-scoring-edges.spec.ts. */
export const SCORING_PARTS = [
  "Don't stop believing — hold on to that feeling.", // apostrophe cong ’ + em-dash
  "I bought 3.5 kg of apples; they were ripe.", // decimal giữa token + `;` đính biên
  "Café naïve résumé.", // NFC composed accents (đối chiếu NFD typed)
  "She said: hello there.", // extras anti-gaming
  "Punctuation matters here!", // dấu câu đính token cuối (strict vs relaxed)
] as const;

export async function ensureScoringFixture(): Promise<void> {
  const c = client();
  const [unit] = await c<{ id: number }>`
    select u.id from units u join books b on b.id = u.book_id
    where b.slug = 'level-3' and u.number = 1
  `;
  if (!unit) throw new Error("unit level-3/1 không tồn tại — DB template sai");
  await c.begin(async (tx) => {
    const [lesson] = await tx<{ id: number }>`
      insert into lessons (unit_id, number, title_en, title_vi, vocab_level, sort_order, published)
      values (${unit.id}, ${SCORING_LESSON_NUMBER}, ${SCORING_LESSON_TITLE},
              'QA-SF2 méo chuẩn gõ', 'A2', ${SCORING_LESSON_NUMBER}, true)
      on conflict (unit_id, number) do update set published = true
      returning id
    `;
    // Parts luôn dựng lại từ SCORING_PARTS (idempotent, sort_order 1..n)
    await tx`delete from lesson_parts where lesson_id = ${lesson!.id}`;
    let order = 1;
    for (const text of SCORING_PARTS) {
      await tx`insert into lesson_parts (lesson_id, sort_order, text) values (${lesson!.id}, ${order++}, ${text})`;
    }
  });
}

/** Self-clean cuối run — guard: còn attempts (RESTRICT) → giữ + báo, không xoá nửa chừng. */
export async function cleanupScoringFixture(): Promise<void> {
  const c = client();
  const rows = await c<{ id: number; attempts: number }>`
    select l.id,
           (select count(*) from attempts a
             join lesson_parts p on p.id = a.part_id
            where p.lesson_id = l.id)::int as attempts
    from lessons l
    where l.number = ${SCORING_LESSON_NUMBER} and l.title_en = ${SCORING_LESSON_TITLE}
  `;
  for (const r of rows) {
    if (r.attempts > 0) {
      throw new Error(
        `QA lesson ${SCORING_LESSON_NUMBER} còn ${r.attempts} attempts (RESTRICT) — giữ nguyên, dọn tay sau`,
      );
    }
    await c`delete from lesson_parts where lesson_id = ${r.id}`;
    await c`delete from lessons where id = ${r.id}`;
  }
}
