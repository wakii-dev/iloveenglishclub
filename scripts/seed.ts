/**
 * Seed SF-2 — idempotent (chạy lại cập nhật, không nhân đôi):
 * - 7 books đúng bảng spec §2 (màu theo design hand-off §1.7)
 * - demo units/lessons/parts cho mọi book; lesson demo L3-U1-L1 published
 *   với 4 part có AUDIO PHÁT ĐƯỢC (tone tự sinh — KHÔNG bản quyền);
 * - L3-U1-L2 published với title_vi NULL (case fallback vi→en, ACCEPTANCE #4);
 * - 1 lesson draft (published=false) để test-rls assert anon không thấy.
 *
 * Chạy: npm run db:seed (cần DATABASE_URL + `lame` trong PATH để sinh mp3).
 * Audio demo COMMIT vào git (path public/audio/...) — script sinh lại bytes
 * giống hệt (sine deterministic + lame cùng input) nên re-run là overwrite.
 *
 * Node type-strip: import relative CÓ extension; DB import động sau khi nạp
 * .env.local (ESM static import sẽ hoist trước dotenv.config).
 */
import { spawnSync } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

type Schema = typeof import("../src/db/schema.ts");

// Client riêng cho script — KHÔNG import src/db/index.ts (dùng import
// extensionless "./schema" chỉ bundler resolve được; node type-strip cần .ts).
// Cùng tham số với db/index.ts: prepare:false (PgBouncer/Neon pooler-safe).
let db: ReturnType<typeof drizzle>;
let s: Schema;

const SAMPLE_RATE = 16000;
const DEMO_DURATION_MS = 3500;

/** Book content theo bảng §2 spec — 7 dòng cố định (id 1–7). */
const BOOKS = [
  {
    id: 1,
    slug: "level-1",
    titleEn: "Level 1 — Starter",
    titleVi: "Cấp độ 1 — Starter",
    cefr: "Pre-A1",
    exam: null as string | null,
    color: "#f59e0b",
    descEn: "First English words and short phrases for absolute beginners.",
    descVi: "Từ và cụm từ tiếng Anh đầu tiên cho người mới bắt đầu.",
  },
  {
    id: 2,
    slug: "level-2",
    titleEn: "Level 2",
    titleVi: "Cấp độ 2",
    cefr: "A1",
    exam: "Movers/Flyers",
    color: "#e85d3d",
    descEn: "Everyday topics with simple sentences and clear audio.",
    descVi: "Chủ đề thường ngày với câu đơn giản và audio rõ ràng.",
  },
  {
    id: 3,
    slug: "level-3",
    titleEn: "Level 3",
    titleVi: "Cấp độ 3",
    cefr: "A2",
    exam: "A2 Key (KET) for Schools",
    color: "#0e9488",
    descEn: "Build confidence with longer sentences and natural speech.",
    descVi: "Tự tin hơn với câu dài hơn và giọng nói tự nhiên.",
  },
  {
    id: 4,
    slug: "level-4",
    titleEn: "Level 4",
    titleVi: "Cấp độ 4",
    cefr: "A2+",
    exam: "Preliminary for Schools",
    color: "#0284c7",
    descEn: "A bridge level toward B1 — richer vocabulary, faster audio.",
    descVi: "Cầu nối lên B1 — từ vựng giàu hơn, audio nhanh hơn.",
  },
  {
    id: 5,
    slug: "level-5",
    titleEn: "Level 5",
    titleVi: "Cấp độ 5",
    cefr: "B1",
    exam: "B1 Preliminary (PET) for Schools",
    color: "#7c3aed",
    descEn: "Intermediate listening practice for PET candidates.",
    descVi: "Luyện nghe trung cấp cho thí sinh thi PET.",
  },
  {
    id: 6,
    slug: "level-6",
    titleEn: "Level 6",
    titleVi: "Cấp độ 6",
    cefr: "B1+",
    exam: "First for Schools",
    color: "#be185d",
    descEn: "Upper-intermediate dictation on the way to B2.",
    descVi: "Dictation trên trung cấp trên đường tới B2.",
  },
  {
    id: 7,
    slug: "level-7",
    titleEn: "Level 7",
    titleVi: "Cấp độ 7",
    cefr: "B2",
    exam: "B2 First (FCE) for Schools",
    color: "#111827",
    descEn: "Exam-level listening — full-speed natural dictation.",
    descVi: "Nghe cấp độ thi — dictation tự nhiên tốc độ thật.",
  },
];

type UnitSeed = {
  book: string;
  number: number;
  titleEn: string;
  titleVi: string | null;
  descEn: string;
  descVi: string | null;
};

const UNITS: UnitSeed[] = [
  { book: "level-3", number: 1, titleEn: "Free time", titleVi: "Thời gian rảnh", descEn: "Hobbies, sports and weekend plans.", descVi: "Sở thích, thể thao và kế hoạch cuối tuần." },
  { book: "level-3", number: 2, titleEn: "My day", titleVi: "Ngày của tôi", descEn: "Daily routines and telling the time.", descVi: "Thói quen hằng ngày và xem giờ." },
  { book: "level-1", number: 1, titleEn: "Hello!", titleVi: "Xin chào!", descEn: "Greetings and names.", descVi: "Chào hỏi và tên gọi." },
  { book: "level-1", number: 2, titleEn: "Colours and numbers", titleVi: "Màu sắc và con số", descEn: "Basic colours and counting to ten.", descVi: "Màu cơ bản và đếm đến mười." },
  { book: "level-2", number: 1, titleEn: "My family", titleVi: "Gia đình tôi", descEn: "Family members and pets.", descVi: "Thành viên gia đình và thú cưng." },
  { book: "level-2", number: 2, titleEn: "At school", titleVi: "Ở trường", descEn: "Classroom objects and subjects.", descVi: "Đồ dùng lớp học và môn học." },
  { book: "level-4", number: 1, titleEn: "Travel", titleVi: "Du lịch", descEn: "Journeys, tickets and directions.", descVi: "Chuyến đi, vé và chỉ đường." },
  { book: "level-4", number: 2, titleEn: "Food and health", titleVi: "Ẩm thực và sức khỏe", descEn: "Eating habits and feeling well.", descVi: "Thói quen ăn uống và sức khỏe." },
  { book: "level-5", number: 1, titleEn: "Media", titleVi: "Truyền thông", descEn: "News, phones and the internet.", descVi: "Tin tức, điện thoại và internet." },
  { book: "level-5", number: 2, titleEn: "Work", titleVi: "Công việc", descEn: "Jobs, interviews and workplaces.", descVi: "Nghề nghiệp, phỏng vấn và nơi làm việc." },
  { book: "level-6", number: 1, titleEn: "Environment", titleVi: "Môi trường", descEn: "Nature, recycling and climate.", descVi: "Thiên nhiên, tái chế và khí hậu." },
  { book: "level-6", number: 2, titleEn: "Culture", titleVi: "Văn hóa", descEn: "Festivals, music and art around the world.", descVi: "Lễ hội, âm nhạc và nghệ thuật khắp thế giới." },
  { book: "level-7", number: 1, titleEn: "Society", titleVi: "Xã hội", descEn: "Debates, opinions and current issues.", descVi: "Tranh luận, quan điểm và vấn đề thời sự." },
  { book: "level-7", number: 2, titleEn: "Science and technology", titleVi: "Khoa học và công nghệ", descEn: "Inventions, AI and the future.", descVi: "Phát minh, AI và tương lai." },
];

type PartSeed = { text: string; audio: boolean };

type LessonSeed = {
  book: string;
  unit: number;
  number: number;
  titleEn: string;
  titleVi: string | null;
  vocab: Schema["vocabLevelEnum"]["enumValues"][number];
  published: boolean;
  parts: PartSeed[];
};

const LESSONS: LessonSeed[] = [
  {
    book: "level-3", unit: 1, number: 1,
    titleEn: "Vocabulary — Free time activities",
    titleVi: "Từ vựng — Hoạt động thời gian rảnh",
    vocab: "A2", published: true,
    parts: [
      { text: "I play football with my friends every Saturday.", audio: true },
      { text: "She likes reading books in the library.", audio: true },
      { text: "We watch a film at the weekend.", audio: true },
      { text: "My brother goes swimming on Friday.", audio: true },
    ],
  },
  {
    book: "level-3", unit: 1, number: 2,
    titleEn: "Dialogue — After school",
    titleVi: null, // fallback case: thiếu bản dịch → hiện tiếng Anh (ACCEPTANCE #4)
    vocab: "A2", published: true,
    parts: [
      { text: "What do you do after school?", audio: false },
      { text: "I usually do my homework first.", audio: false },
      { text: "Then I ride my bike in the park.", audio: false },
    ],
  },
  { book: "level-3", unit: 2, number: 1, titleEn: "Vocabulary — Daily routines", titleVi: "Từ vựng — Thói quen hằng ngày", vocab: "A2", published: true, parts: [ { text: "I wake up at six o'clock.", audio: false }, { text: "He has breakfast at half past six.", audio: false }, { text: "We go to bed at ten o'clock.", audio: false } ] },
  { book: "level-3", unit: 2, number: 2, titleEn: "Dialogue — Busy morning", titleVi: "Hội thoại — Buổi sáng bận rộn", vocab: "A2", published: true, parts: [ { text: "Hurry up, the bus leaves at seven.", audio: false }, { text: "I'm coming, I just need my bag.", audio: false } ] },
  // Draft — anon KHÔNG được thấy (test-rls assert)
  { book: "level-3", unit: 2, number: 3, titleEn: "Draft — Weekend plans (coming soon)", titleVi: "Nháp — Kế hoạch cuối tuần", vocab: "A2", published: false, parts: [ { text: "Draft sentence one.", audio: false }, { text: "Draft sentence two.", audio: false } ] },
  { book: "level-1", unit: 1, number: 1, titleEn: "Vocabulary — Greetings", titleVi: "Từ vựng — Chào hỏi", vocab: "Pre-A1", published: true, parts: [ { text: "Hello, my name is Mai.", audio: false }, { text: "Good morning, teacher.", audio: false } ] },
  { book: "level-1", unit: 2, number: 1, titleEn: "Vocabulary — Colours", titleVi: "Từ vựng — Màu sắc", vocab: "Pre-A1", published: true, parts: [ { text: "The sky is blue.", audio: false }, { text: "I have a red pen.", audio: false } ] },
  { book: "level-2", unit: 1, number: 1, titleEn: "Vocabulary — My family", titleVi: "Từ vựng — Gia đình tôi", vocab: "A1", published: true, parts: [ { text: "This is my mother and my father.", audio: false }, { text: "My sister is six years old.", audio: false } ] },
  { book: "level-2", unit: 2, number: 1, titleEn: "Vocabulary — At school", titleVi: "Từ vựng — Ở trường", vocab: "A1", published: true, parts: [ { text: "Open your books, please.", audio: false }, { text: "Where is my pencil case?", audio: false } ] },
  { book: "level-4", unit: 1, number: 1, titleEn: "Vocabulary — Travel basics", titleVi: "Từ vựng — Du lịch cơ bản", vocab: "A2+", published: true, parts: [ { text: "The train to Hanoi leaves at nine.", audio: false }, { text: "Could I have a ticket to Da Nang?", audio: false } ] },
  { book: "level-4", unit: 2, number: 1, titleEn: "Vocabulary — Healthy habits", titleVi: "Từ vựng — Thói quen lành mạnh", vocab: "A2+", published: true, parts: [ { text: "You should drink more water.", audio: false }, { text: "Fruit and vegetables are good for you.", audio: false } ] },
  { book: "level-5", unit: 1, number: 1, titleEn: "Vocabulary — Online life", titleVi: "Từ vựng — Đời sống online", vocab: "B1", published: true, parts: [ { text: "She posts photos on her profile every day.", audio: false }, { text: "The article went viral within hours.", audio: false } ] },
  { book: "level-5", unit: 2, number: 1, titleEn: "Vocabulary — At work", titleVi: "Từ vựng — Ở nơi làm việc", vocab: "B1", published: true, parts: [ { text: "He applied for a job at a design studio.", audio: false }, { text: "The meeting has been moved to Friday.", audio: false } ] },
  { book: "level-6", unit: 1, number: 1, titleEn: "Vocabulary — Our planet", titleVi: "Từ vựng — Hành tinh của chúng ta", vocab: "B1+", published: true, parts: [ { text: "Recycling reduces the amount of waste we produce.", audio: false }, { text: "Climate change affects farmers around the world.", audio: false } ] },
  { book: "level-6", unit: 2, number: 1, titleEn: "Vocabulary — Festivals", titleVi: "Từ vựng — Lễ hội", vocab: "B1+", published: true, parts: [ { text: "The lantern festival attracts thousands of visitors.", audio: false }, { text: "Traditional music was performed in the square.", audio: false } ] },
  { book: "level-7", unit: 1, number: 1, titleEn: "Vocabulary — Society and debate", titleVi: "Từ vựng — Xã hội và tranh luận", vocab: "B2", published: true, parts: [ { text: "Access to education remains unequal across regions.", audio: false }, { text: "The government has introduced new housing policies.", audio: false } ] },
  { book: "level-7", unit: 2, number: 1, titleEn: "Vocabulary — Technology today", titleVi: "Từ vựng — Công nghệ hôm nay", vocab: "B2", published: true, parts: [ { text: "Artificial intelligence is transforming the workplace.", audio: false }, { text: "Innovations in medicine have saved countless lives.", audio: false } ] },
];

/** Sinh WAV 16-bit mono PCM sine — deterministic (cùng tham số = cùng bytes). */
function makeToneWav(freq: number, durationMs: number): Buffer {
  const n = Math.floor((SAMPLE_RATE * durationMs) / 1000);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // envelope: attack nhanh + decay mượt — nghe là "tiếng" rõ, không chói
    const env = Math.min(1, t * 10) * Math.exp(-t * 1.1);
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 11000;
    data.writeInt16LE(Math.round(sample), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** lame WAV→mp3 qua stdin/stdout — trả buffer cho putAudio (storage abstraction). */
function wavToMp3(wav: Buffer): Buffer {
  const res = spawnSync("lame", ["--quiet", "-", "-"], {
    input: wav,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (res.status !== 0 || !res.stdout?.length) {
    throw new Error(
      `lame encode failed (${res.status}): ${res.stderr?.toString().slice(0, 200)}`,
    );
  }
  return res.stdout;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL thiếu — set trong .env.local");
    process.exit(1);
  }
  const storage = await import("../src/lib/storage.ts");
  const storageServer = await import("../src/lib/storage-server.ts");
  const sql = postgres(process.env.DATABASE_URL, { prepare: false });
  db = drizzle(sql);
  s = await import("../src/db/schema.ts");
  try {
    await seedAll(storage, storageServer);
  } finally {
    // pool giữ event loop — không end() thì process treo sau khi xong
    await sql.end({ timeout: 5 });
  }
}

async function seedAll(
  storage: typeof import("../src/lib/storage.ts"),
  storageServer: typeof import("../src/lib/storage-server.ts"),
): Promise<void> {

  // 1. Books — upsert theo id (7 dòng cố định, chỉnh qua migration/seed)
  for (const b of BOOKS) {
    const values = {
      id: b.id,
      slug: b.slug,
      titleEn: b.titleEn,
      titleVi: b.titleVi,
      cefrLabel: b.cefr,
      examTarget: b.exam,
      descEn: b.descEn,
      descVi: b.descVi,
      color: b.color,
      sortOrder: b.id,
    };
    await db.insert(s.books).values(values).onConflictDoUpdate({
      target: s.books.id,
      set: values,
    });
  }
  const bookRows = await db
    .select({ id: s.books.id, slug: s.books.slug })
    .from(s.books);
  const bookIdBySlug = new Map(bookRows.map((r) => [r.slug, r.id]));

  // 2. Units — upsert theo (book_id, number)
  for (const u of UNITS) {
    const bookId = bookIdBySlug.get(u.book);
    if (!bookId) throw new Error(`book không tồn tại: ${u.book}`);
    const values = {
      bookId,
      number: u.number,
      titleEn: u.titleEn,
      titleVi: u.titleVi,
      descEn: u.descEn,
      descVi: u.descVi,
      sortOrder: u.number,
    };
    await db.insert(s.units).values(values).onConflictDoUpdate({
      target: [s.units.bookId, s.units.number],
      set: {
        titleEn: u.titleEn,
        titleVi: u.titleVi,
        descEn: u.descEn,
        descVi: u.descVi,
        sortOrder: u.number,
      },
    });
  }
  const unitRows = await db
    .select({ id: s.units.id, slug: s.books.slug, number: s.units.number })
    .from(s.units)
    .innerJoin(s.books, eq(s.units.bookId, s.books.id));
  const unitKey = (slug: string, number: number) => `${slug}/u${number}`;
  const unitIdByKey = new Map(
    unitRows.map((r) => [unitKey(r.slug, r.number), r.id]),
  );

  // 3. Lessons — upsert theo (unit_id, number)
  for (const l of LESSONS) {
    const unitId = unitIdByKey.get(unitKey(l.book, l.unit));
    if (!unitId) throw new Error(`unit không tồn tại: ${unitKey(l.book, l.unit)}`);
    const values = {
      unitId,
      number: l.number,
      titleEn: l.titleEn,
      titleVi: l.titleVi,
      vocabLevel: l.vocab,
      published: l.published,
      sortOrder: l.number,
    };
    await db.insert(s.lessons).values(values).onConflictDoUpdate({
      target: [s.lessons.unitId, s.lessons.number],
      set: {
        titleEn: l.titleEn,
        titleVi: l.titleVi,
        vocabLevel: l.vocab,
        published: l.published,
        sortOrder: l.number,
      },
    });
  }

  // 4. Parts — upsert theo (lesson_id, sort_order); tone mp3 cho part demo
  const DEMO_FREQUENCIES = [330, 440, 494, 523]; // E4-A4-B4-C5 — mỗi câu 1 cao độ
  let audioCount = 0;
  for (const l of LESSONS) {
    const unitId = unitIdByKey.get(unitKey(l.book, l.unit))!;
    const [lesson] = await db
      .select({ id: s.lessons.id })
      .from(s.lessons)
      .where(and(eq(s.lessons.unitId, unitId), eq(s.lessons.number, l.number)))
      .limit(1);
    if (!lesson) throw new Error(`lesson không tồn tại: ${l.titleEn}`);

    for (const [idx, p] of l.parts.entries()) {
      const sortOrder = idx + 1;
      let audioPath: string | null = null;
      let durationMs: number | null = null;
      if (p.audio) {
        const path = storage.buildAudioPath({
          book: l.book,
          unit: `unit-${l.unit}`,
          lesson: `lesson-${l.number}`,
          index: sortOrder,
        });
        const wav = makeToneWav(
          DEMO_FREQUENCIES[idx % DEMO_FREQUENCIES.length],
          DEMO_DURATION_MS,
        );
        await storageServer.putAudio(path, wavToMp3(wav));
        audioPath = path;
        durationMs = DEMO_DURATION_MS;
        audioCount++;
      }
      const values = {
        lessonId: lesson.id,
        sortOrder,
        text: p.text,
        audioPath,
        durationMs,
      };
      await db.insert(s.lessonParts).values(values).onConflictDoUpdate({
        target: [s.lessonParts.lessonId, s.lessonParts.sortOrder],
        set: { text: p.text, audioPath, durationMs },
      });
    }
  }

  console.log(
    `seed OK: ${BOOKS.length} books · ${UNITS.length} units · ${LESSONS.length} lessons · ${audioCount} audio mp3 (${DEMO_DURATION_MS}ms/part)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
