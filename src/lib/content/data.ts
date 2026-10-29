import { buildAudioPath } from "@/lib/storage";

/**
 * Content snapshot SF2 (ilec-v2) — bản snapshot TĨNH của seed demo ilec
 * (scripts/seed.ts, commit trong repo nguồn): 7 books theo bảng spec §2 +
 * demo units/lessons/parts. Lesson demo CÓ AUDIO PHÁT ĐƯỢC (tone sine tự
 * sinh — không bản quyền) là level-3/unit-1/lesson-1 (4 part, 3.5s/part,
 * file mp3 commit ở public/audio/...).
 *
 * Vì sao tĩnh: ilec-v2 SF2 CHƯA có Postgres (auth/DB là SF3+) — guest flow
 * phải chạy được không cần infra. Queries (lib/content/queries.ts) giữ cùng
 * signature + fallback chain vi→en + published-only như ilec; SF3 đổi backend
 * drizzle là các trang không phải sửa. Draft lesson (published=false) giữ
 * trong data để câu chuyện dữ liệu giống seed, queries lọc ra như DB.
 */

const DEMO_DURATION_MS = 3500;

type BookRow = {
  id: number;
  slug: string;
  titleEn: string;
  titleVi: string | null;
  cefrLabel: string;
  examTarget: string | null;
  color: string;
  descEn: string;
  descVi: string | null;
  sortOrder: number;
};

/** Book content theo bảng §2 spec nguồn — 7 dòng cố định (id 1–7). */
const BOOKS: BookRow[] = [
  { id: 1, slug: "level-1", titleEn: "Level 1 — Starter", titleVi: "Cấp độ 1 — Starter", cefrLabel: "Pre-A1", examTarget: null, color: "#f59e0b", descEn: "First English words and short phrases for absolute beginners.", descVi: "Từ và cụm từ tiếng Anh đầu tiên cho người mới bắt đầu.", sortOrder: 1 },
  { id: 2, slug: "level-2", titleEn: "Level 2", titleVi: "Cấp độ 2", cefrLabel: "A1", examTarget: "Movers/Flyers", color: "#e85d3d", descEn: "Everyday topics with simple sentences and clear audio.", descVi: "Chủ đề thường ngày với câu đơn giản và audio rõ ràng.", sortOrder: 2 },
  { id: 3, slug: "level-3", titleEn: "Level 3", titleVi: "Cấp độ 3", cefrLabel: "A2", examTarget: "A2 Key (KET) for Schools", color: "#0e9488", descEn: "Build confidence with longer sentences and natural speech.", descVi: "Tự tin hơn với câu dài hơn và giọng nói tự nhiên.", sortOrder: 3 },
  { id: 4, slug: "level-4", titleEn: "Level 4", titleVi: "Cấp độ 4", cefrLabel: "A2+", examTarget: "Preliminary for Schools", color: "#0284c7", descEn: "A bridge level toward B1 — richer vocabulary, faster audio.", descVi: "Cầu nối lên B1 — từ vựng giàu hơn, audio nhanh hơn.", sortOrder: 4 },
  { id: 5, slug: "level-5", titleEn: "Level 5", titleVi: "Cấp độ 5", cefrLabel: "B1", examTarget: "B1 Preliminary (PET) for Schools", color: "#7c3aed", descEn: "Intermediate listening practice for PET candidates.", descVi: "Luyện nghe trung cấp cho thí sinh thi PET.", sortOrder: 5 },
  { id: 6, slug: "level-6", titleEn: "Level 6", titleVi: "Cấp độ 6", cefrLabel: "B1+", examTarget: "First for Schools", color: "#be185d", descEn: "Upper-intermediate dictation on the way to B2.", descVi: "Dictation trên trung cấp trên đường tới B2.", sortOrder: 6 },
  { id: 7, slug: "level-7", titleEn: "Level 7", titleVi: "Cấp độ 7", cefrLabel: "B2", examTarget: "B2 First (FCE) for Schools", color: "#111827", descEn: "Exam-level listening — full-speed natural dictation.", descVi: "Nghe cấp độ thi — dictation tự nhiên tốc độ thật.", sortOrder: 7 },
];

type UnitRow = {
  id: number;
  bookId: number;
  number: number;
  titleEn: string;
  titleVi: string | null;
  descEn: string;
  descVi: string | null;
};

const UNITS: (Omit<UnitRow, "id" | "bookId"> & { book: string })[] = [
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
  vocab: string;
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
  // Draft — anon/guest KHÔNG thấy (queries lọc published như DB ở ilec)
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

// ─── Derive rows với id deterministic (unit 101+, lesson 201+, part lessonId×10+số) ───

const bookBySlug = new Map(BOOKS.map((b) => [b.slug, b]));

export const unitRows: UnitRow[] = UNITS.map((u, i) => {
  const book = bookBySlug.get(u.book);
  if (!book) throw new Error(`book không tồn tại: ${u.book}`);
  return {
    id: 101 + i,
    bookId: book.id,
    number: u.number,
    titleEn: u.titleEn,
    titleVi: u.titleVi,
    descEn: u.descEn,
    descVi: u.descVi,
  };
});

export type LessonPartRow = {
  id: number;
  lessonId: number;
  sortOrder: number;
  text: string;
  audioPath: string | null;
  durationMs: number | null;
};

export type LessonRow = {
  id: number;
  unitId: number;
  number: number;
  titleEn: string;
  titleVi: string | null;
  vocabLevel: string;
  published: boolean;
  parts: LessonPartRow[];
};

export const lessonRows: LessonRow[] = LESSONS.map((l, i) => {
  const unit = unitRows.find((u) => {
    const book = BOOKS.find((b) => b.id === u.bookId);
    return book?.slug === l.book && u.number === l.unit;
  });
  if (!unit) throw new Error(`unit không tồn tại: ${l.book}/u${l.unit}`);
  const lessonId = 201 + i;
  return {
    id: lessonId,
    unitId: unit.id,
    number: l.number,
    titleEn: l.titleEn,
    titleVi: l.titleVi,
    vocabLevel: l.vocab,
    published: l.published,
    parts: l.parts.map((p, pi) => ({
      id: lessonId * 10 + (pi + 1),
      lessonId,
      sortOrder: pi + 1,
      text: p.text,
      // audioPath layout như seed nguồn: audio/{book}/unit-{n}/lesson-{m}/{NN}.mp3
      audioPath: p.audio
        ? buildAudioPath({
            book: l.book,
            unit: `unit-${l.unit}`,
            lesson: `lesson-${l.number}`,
            index: pi + 1,
          })
        : null,
      durationMs: p.audio ? DEMO_DURATION_MS : null,
    })),
  };
});

export { BOOKS as bookRows, bookBySlug };
