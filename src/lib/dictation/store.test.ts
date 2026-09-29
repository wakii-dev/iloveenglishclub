import { describe, expect, it } from "vitest";
import { createDictationStore, lessonProgress, averageAccuracyOfDone, useDictationStore } from "./store";

const LESSON = [
  { transcript: "The cat." },
  { transcript: "Two words here." },
  { transcript: "Last one!" },
];

/** store ở start-gate (đã hydrate, chờ gesture). */
const fresh = () => {
  const s = createDictationStore();
  s.getState().start(LESSON);
  return s;
};

/** store đang active ở part 0 (phase playing). */
const active = () => {
  const s = fresh();
  s.getState().start();
  return s;
};

describe("start — idle → start-gate → playing (§5.4 start gate)", () => {
  it("start(lesson) ở idle → hydrate parts pending, phase start-gate", () => {
    const s = fresh();
    const st = s.getState();
    expect(st.phase).toBe("start-gate");
    expect(st.parts).toHaveLength(3);
    expect(st.parts.every((p) => p.status === "pending")).toBe(true);
    expect(st.currentPartIndex).toBe(0);
    expect(st.isPlaying).toBe(false);
  });

  it("start() ở start-gate (user gesture) → playing + isPlaying", () => {
    const s = fresh();
    s.getState().start();
    expect(s.getState().phase).toBe("playing");
    expect(s.getState().isPlaying).toBe(true);
  });

  it("lesson 0 part → complete ngay (degenerate, spec §3.2)", () => {
    const s = createDictationStore();
    s.getState().start([]);
    expect(s.getState().phase).toBe("complete");
  });

  it("start(lesson) khi KHÔNG idle → no-op (không re-hydrate)", () => {
    const s = fresh();
    s.getState().start(LESSON);
    expect(s.getState().phase).toBe("start-gate");
    expect(s.getState().parts).toHaveLength(3);
  });

  it("start() không arg ở idle → no-op (vẫn idle)", () => {
    const s = createDictationStore();
    s.getState().start();
    expect(s.getState().phase).toBe("idle");
  });

  it("start() không arg ở playing → no-op", () => {
    const s = active();
    s.getState().start();
    expect(s.getState().phase).toBe("playing");
  });
});

describe("play / pause / replay — audio intent (KHÔNG đụng audio thật)", () => {
  it("play() ở input → playing + isPlaying", () => {
    const s = active();
    s.getState().pause();
    s.getState().play();
    expect(s.getState().phase).toBe("playing");
    expect(s.getState().isPlaying).toBe(true);
  });

  it("play() ở checked → isPlaying true, phase giữ checked (xem kết quả vẫn nghe lại được)", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    s.getState().play();
    expect(s.getState().isPlaying).toBe(true);
    expect(s.getState().phase).toBe("checked");
  });

  it("play() ở idle → no-op", () => {
    const s = createDictationStore();
    s.getState().play();
    expect(s.getState().isPlaying).toBe(false);
  });

  it("play() ở start-gate → no-op (chưa qua gesture)", () => {
    const s = fresh();
    s.getState().play();
    expect(s.getState().isPlaying).toBe(false);
    expect(s.getState().phase).toBe("start-gate");
  });

  it("pause() ở playing → input + isPlaying false", () => {
    const s = active();
    s.getState().pause();
    expect(s.getState().phase).toBe("input");
    expect(s.getState().isPlaying).toBe(false);
  });

  it("pause() ở checked → isPlaying false, phase giữ checked", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    s.getState().pause();
    expect(s.getState().phase).toBe("checked");
    expect(s.getState().isPlaying).toBe(false);
  });

  it("pause() ở idle → no-op", () => {
    const s = createDictationStore();
    s.getState().pause();
    expect(s.getState().isPlaying).toBe(false);
    expect(s.getState().phase).toBe("idle");
  });

  it("replay() ở input → seekRequest {ms:0,nonce:1}, phase playing", () => {
    const s = active();
    s.getState().pause();
    s.getState().replay();
    const st = s.getState();
    expect(st.seekRequest).toEqual({ ms: 0, nonce: 1 });
    expect(st.isPlaying).toBe(true);
    expect(st.phase).toBe("playing");
  });

  it("replay() ở checked → phase giữ checked", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    s.getState().replay();
    expect(s.getState().phase).toBe("checked");
    expect(s.getState().isPlaying).toBe(true);
  });

  it("replay() ở idle → no-op (seekRequest null)", () => {
    const s = createDictationStore();
    s.getState().replay();
    expect(s.getState().seekRequest).toBeNull();
  });

  it("replay() tăng nonce qua mediaNonce", () => {
    const s = active();
    s.getState().replay();
    s.getState().replay();
    expect(s.getState().seekRequest).toEqual({ ms: 0, nonce: 2 });
  });
});

describe("setSpeed / seek", () => {
  it("setSpeed hợp lệ (0.5/1/1.5) → set", () => {
    const s = active();
    s.getState().setSpeed(1.5);
    expect(s.getState().speed).toBe(1.5);
    s.getState().setSpeed(0.5);
    expect(s.getState().speed).toBe(0.5);
  });

  it("setSpeed lạ (1.3) → no-op", () => {
    const s = active();
    s.getState().setSpeed(1.3);
    expect(s.getState().speed).toBe(1);
  });

  it("seek(ms) ở active → seekRequest nonce tăng", () => {
    const s = active();
    s.getState().seek(3000);
    expect(s.getState().seekRequest).toEqual({ ms: 3000, nonce: 1 });
  });

  it("seek ở idle → no-op", () => {
    const s = createDictationStore();
    s.getState().seek(3000);
    expect(s.getState().seekRequest).toBeNull();
  });
});

describe("setInput — sửa sau check về input (§5.4 check lại)", () => {
  it("setInput ở input → input cập nhật", () => {
    const s = active();
    s.getState().setInput("The cat.");
    expect(s.getState().input).toBe("The cat.");
    expect(s.getState().phase).toBe("playing");
  });

  it("setInput sau check → phase về input (banner tắt, chờ check lại)", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    expect(s.getState().phase).toBe("checked");
    s.getState().setInput("The cat");
    expect(s.getState().phase).toBe("input");
  });

  it("setInput ở idle → no-op", () => {
    const s = createDictationStore();
    s.getState().setInput("x");
    expect(s.getState().input).toBe("");
  });

  it("setInput khi part RESOLVED (xem lại) → no-op (đóng băng)", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    s.getState().next(); // part 0 done → part 1
    s.getState().prevPart(); // về part 0 (done, xem lại)
    s.getState().setInput("hack");
    expect(s.getState().input).not.toBe("hack");
  });
});

describe("check — attempts + XP bank ở attempt ĐẦU (spec §1.4(2))", () => {
  it("check đúng lần đầu: attempts 1, xp 10 bank, phase checked", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    const st = s.getState();
    expect(st.phase).toBe("checked");
    expect(st.parts[0]!.attempts).toBe(1);
    expect(st.parts[0]!.xpEarned).toBe(10);
    expect(st.earnedXp).toBe(10);
    expect(st.parts[0]!.status).toBe("pending"); // done do next()
    expect(st.parts[0]!.lastDiff?.allCorrect).toBe(true);
  });

  it("check SAI lần đầu: bank XP theo accuracy attempt đó (0.5 → 5)", () => {
    const s = active();
    s.getState().setInput("The fat"); // cat.→fat wrong + missing
    s.getState().check();
    const st = s.getState();
    expect(st.parts[0]!.attempts).toBe(1);
    expect(st.parts[0]!.xpEarned).toBe(5); // 10 × 0.5
    expect(st.earnedXp).toBe(5);
  });

  it("check-sai → sửa → check-LẠI OK: attempts 2, earnedXp KHÔNG cộng thêm", () => {
    const s = active();
    s.getState().setInput("The fat");
    s.getState().check();
    s.getState().setInput("The cat.");
    s.getState().check();
    const st = s.getState();
    expect(st.parts[0]!.attempts).toBe(2);
    expect(st.parts[0]!.xpEarned).toBe(5); // giữ XP attempt đầu
    expect(st.earnedXp).toBe(5);
    expect(st.parts[0]!.lastDiff?.allCorrect).toBe(true);
  });

  it("check ở idle → no-op", () => {
    const s = createDictationStore();
    s.getState().check();
    expect(s.getState().earnedXp).toBe(0);
  });

  it("check khi part RESOLVED → no-op", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    s.getState().next();
    s.getState().prevPart();
    const before = s.getState().parts[0]!.attempts;
    s.getState().check();
    expect(s.getState().parts[0]!.attempts).toBe(before);
  });

  it("check input rỗng → accuracy 0, bank 0 XP, TIÊU attempt đầu (spec §3.2)", () => {
    const s = active();
    s.getState().check();
    const st = s.getState();
    expect(st.parts[0]!.attempts).toBe(1);
    expect(st.parts[0]!.xpEarned).toBe(0);
    s.getState().setInput("The cat.");
    s.getState().check();
    expect(st.earnedXp).toBe(0);
    expect(s.getState().parts[0]!.xpEarned).toBe(0); // attempt 2 vẫn 0
  });

  it("relaxed toggle trước check → diff relaxed (Cat = cat)", () => {
    const s = active();
    s.getState().toggleRelaxed();
    s.getState().setInput("the cat");
    s.getState().check();
    expect(s.getState().parts[0]!.lastDiff?.allCorrect).toBe(true);
  });
});

describe("hint — diff TƯƠI, dùng trước check (P0 spec-critic: XP=8 phải đạt được)", () => {
  it("hint TRƯỚC check đầu → reveal từ 0, rồi check → xp 8 (×0.8)", () => {
    const s = active();
    s.getState().hint();
    const st = s.getState();
    expect(st.parts[0]!.usedHint).toBe(true);
    expect(st.parts[0]!.revealedIndices).toEqual([0]);
    s.getState().setInput("The cat.");
    s.getState().check();
    expect(s.getState().parts[0]!.xpEarned).toBe(8);
    expect(s.getState().earnedXp).toBe(8);
  });

  it("hint khi chưa reveal tiếp (chưa sửa) → no-op thứ 2, không thêm index", () => {
    const s = active();
    s.getState().hint();
    s.getState().hint();
    expect(s.getState().parts[0]!.revealedIndices).toEqual([0]);
  });

  it("hint sau khi gõ đúng từ đã reveal → reveal từ kế tiếp", () => {
    const s = active();
    s.getState().hint(); // reveal 0 ("The")
    s.getState().setInput("The"); // từ 0 giờ matched
    s.getState().hint(); // reveal 1
    expect(s.getState().parts[0]!.revealedIndices).toEqual([0, 1]);
  });

  it("hint khi allCorrect (input đủ) → no-op, usedHint không flag", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().hint();
    expect(s.getState().parts[0]!.usedHint).toBe(false);
    expect(s.getState().parts[0]!.revealedIndices).toEqual([]);
  });

  it("hint ở idle → no-op", () => {
    const s = createDictationStore();
    s.getState().hint();
    expect(s.getState().parts).toHaveLength(0);
  });

  it("hint khi part RESOLVED → no-op", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    s.getState().next();
    s.getState().prevPart();
    s.getState().hint();
    // part 0 đã done — revealedIndices không đổi từ lúc check (rỗng)
    expect(s.getState().parts[0]!.revealedIndices).toEqual([]);
  });
});

describe("skip — không cộng done, không XP mới (context pack ACCEPTANCE)", () => {
  it("skip part chưa check → skipped, advance sang part kế (autoplay)", () => {
    const s = active();
    s.getState().skip();
    const st = s.getState();
    expect(st.parts[0]!.status).toBe("skipped");
    expect(st.parts[0]!.xpEarned).toBe(0);
    expect(st.currentPartIndex).toBe(1);
    expect(st.phase).toBe("playing");
    expect(st.input).toBe("");
  });

  it("skip KHÔNG cộng progress done (lessonProgress)", () => {
    const s = active();
    s.getState().skip();
    expect(lessonProgress(s.getState())).toEqual({ done: 0, skipped: 1, total: 3 });
  });

  it("check sai bank xp 5 → skip → earnedXp GIỮ NGUYÊN (spec §3.2)", () => {
    const s = active();
    s.getState().setInput("The fat");
    s.getState().check(); // accuracy 1/2 → xp 5 banked
    s.getState().skip();
    expect(s.getState().parts[0]!.status).toBe("skipped");
    expect(s.getState().earnedXp).toBe(5);
  });

  it("skip part cuối → complete", () => {
    const s = createDictationStore();
    s.getState().start([{ transcript: "Only one." }]);
    s.getState().start();
    s.getState().skip();
    expect(s.getState().phase).toBe("complete");
  });

  it("skip ở idle → no-op", () => {
    const s = createDictationStore();
    s.getState().skip();
    expect(s.getState().phase).toBe("idle");
  });

  it("skip khi part RESOLVED (xem lại) → no-op, không advance", () => {
    const s = active();
    s.getState().skip(); // part 0 skipped → part 1
    s.getState().prevPart(); // về part 0
    s.getState().skip();
    expect(s.getState().parts[0]!.status).toBe("skipped");
    expect(s.getState().currentPartIndex).toBe(0);
  });
});

describe("next — done | skipped ngầm | advance | complete (§5.4)", () => {
  it("next sau check đúng → done + advance (autoplay câu kế)", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    s.getState().next();
    const st = s.getState();
    expect(st.parts[0]!.status).toBe("done");
    expect(st.currentPartIndex).toBe(1);
    expect(st.phase).toBe("playing");
    expect(st.input).toBe("");
  });

  it("next sau check SAI → skipped ngầm (Câu tiếp luôn hiện), earnedXp giữ", () => {
    const s = active();
    s.getState().setInput("The fat");
    s.getState().check(); // xp 5 banked
    s.getState().next();
    const st = s.getState();
    expect(st.parts[0]!.status).toBe("skipped");
    expect(st.earnedXp).toBe(5);
    expect(st.currentPartIndex).toBe(1);
  });

  it("next khi chưa check (playing) → no-op", () => {
    const s = active();
    s.getState().next();
    expect(s.getState().currentPartIndex).toBe(0);
    expect(s.getState().phase).toBe("playing");
  });

  it("next khi RESOLVED (xem lại) → advance không remark", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    s.getState().next(); // part 0 done → part 1
    s.getState().prevPart(); // xem lại part 0
    expect(s.getState().phase).toBe("checked");
    s.getState().next(); // advance → part 1 (vẫn pending), part 0 vẫn done
    expect(s.getState().parts[0]!.status).toBe("done");
    expect(s.getState().currentPartIndex).toBe(1);
  });

  it("part cuối done → complete (mọi part done-or-skipped)", () => {
    const s = createDictationStore();
    s.getState().start([{ transcript: "One." }, { transcript: "Two." }]);
    s.getState().start();
    s.getState().setInput("One.");
    s.getState().check();
    s.getState().next();
    s.getState().setInput("Two.");
    s.getState().check();
    s.getState().next();
    expect(s.getState().phase).toBe("complete");
    expect(s.getState().parts.every((p) => p.status !== "pending")).toBe(true);
  });

  it("advance quét qua part skipped: xem lại 0 → next → nhảy part skipped → pending", () => {
    const s = active();
    s.getState().skip(); // 0 skipped → 1
    s.getState().setInput("Two words here.");
    s.getState().check();
    s.getState().next(); // 1 done → 2
    s.getState().prevPart(); // về 1
    s.getState().prevPart(); // về 0 (skipped, không lastDiff)
    expect(s.getState().phase).toBe("input"); // không diff → input
    s.getState().next(); // advance quét 0-skipped? không: từ current 0 → tìm pending sau 0 → part 2
    expect(s.getState().currentPartIndex).toBe(2);
  });
});

describe("prevPart — xem lại part đã xong (§5.6)", () => {
  it("prevPart có lastDiff → checked + input=typedText", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    s.getState().next();
    s.getState().prevPart();
    const st = s.getState();
    expect(st.currentPartIndex).toBe(0);
    expect(st.phase).toBe("checked");
    expect(st.input).toBe("The cat.");
    expect(st.parts[0]!.lastDiff?.allCorrect).toBe(true);
  });

  it("prevPart part skipped chưa check → input rỗng, phase input", () => {
    const s = active();
    s.getState().skip(); // 0 skipped → 1
    s.getState().prevPart();
    const st = s.getState();
    expect(st.currentPartIndex).toBe(0);
    expect(st.phase).toBe("input");
    expect(st.input).toBe("");
  });

  it("prevPart tại index 0 → no-op", () => {
    const s = active();
    s.getState().prevPart();
    expect(s.getState().currentPartIndex).toBe(0);
  });

  it("prevPart ở idle → no-op", () => {
    const s = createDictationStore();
    s.getState().prevPart();
    expect(s.getState().phase).toBe("idle");
  });

  it("prevPart reset seekRequest để player về đầu câu (nonce monotonic)", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    s.getState().next(); // advance → seekRequest nonce 1
    s.getState().prevPart(); // nonce 2
    expect(s.getState().seekRequest).toEqual({ ms: 0, nonce: 2 });
  });
});

describe("toggleRelaxed / reset / complete terminal", () => {
  it("toggleRelaxed flips", () => {
    const s = active();
    s.getState().toggleRelaxed();
    expect(s.getState().relaxed).toBe(true);
    s.getState().toggleRelaxed();
    expect(s.getState().relaxed).toBe(false);
  });

  it("toggleRelaxed ở idle → no-op", () => {
    const s = createDictationStore();
    s.getState().toggleRelaxed();
    expect(s.getState().relaxed).toBe(false);
  });

  it("toggleRelaxed ở complete → no-op", () => {
    const s = createDictationStore();
    s.getState().start([]);
    s.getState().toggleRelaxed();
    expect(s.getState().relaxed).toBe(false);
  });

  it("reset → về idle ban đầu (đổi lesson)", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    s.getState().reset();
    const st = s.getState();
    expect(st.phase).toBe("idle");
    expect(st.parts).toHaveLength(0);
    expect(st.earnedXp).toBe(0);
    expect(st.input).toBe("");
    expect(st.relaxed).toBe(false);
    expect(st.speed).toBe(1);
    expect(st.seekRequest).toBeNull();
  });

  it("complete là terminal: play/check/setInput/hint/skip no-op", () => {
    const s = createDictationStore();
    s.getState().start([{ transcript: "Only." }]);
    s.getState().start();
    s.getState().skip();
    expect(s.getState().phase).toBe("complete");
    s.getState().play();
    s.getState().check();
    s.getState().setInput("x");
    s.getState().hint();
    s.getState().skip();
    s.getState().next();
    const st = s.getState();
    expect(st.phase).toBe("complete");
    expect(st.input).toBe("");
    expect(st.isPlaying).toBe(false);
  });
});

describe("derived helpers (spec §3.2)", () => {
  it("lessonProgress: done/skipped/total — skip không tính done", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    s.getState().next(); // done
    s.getState().skip(); // skipped
    expect(lessonProgress(s.getState())).toEqual({ done: 1, skipped: 1, total: 3 });
  });

  it("averageAccuracyOfDone: TB accuracy ATTEMPT ĐẦU các part done", () => {
    const s = active();
    s.getState().setInput("The cat.");
    s.getState().check();
    s.getState().next(); // done, firstAcc 1
    s.getState().setInput("Two words");
    s.getState().check(); // firstAcc 2/3 banked
    s.getState().setInput("Two words here.");
    s.getState().check(); // attempt 2 — không đè firstAcc
    s.getState().next(); // done (allCorrect ở attempt 2)
    expect(averageAccuracyOfDone(s.getState().parts)).toBeCloseTo((1 + 2 / 3) / 2);
  });

  it("averageAccuracyOfDone: không có part done → 0", () => {
    expect(averageAccuracyOfDone([])).toBe(0);
  });
});

describe("useDictationStore — hook wrapper (node smoke: throw ngoài render)", () => {
  it("gọi ngoài React render → throw (vẫn là function thật)", () => {
    expect(() => useDictationStore((s) => s.phase)).toThrow();
  });
});
