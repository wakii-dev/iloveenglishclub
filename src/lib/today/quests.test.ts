import { describe, expect, it } from "vitest";
import { QUEST_POOL, selectQuests, type QuestId } from "./quests";

/**
 * Quest pool + selection — daily-journey SF-1 (VU-49, epic spec §2.4 CHỐT
 * CỨNG): pool 7 quest id; selectQuests = SHA-256(`${userId}:${date}`) hex →
 * key mỗi quest = hash-slice-8byte của SHA-256(`${hash}${questId}`) (16 hex
 * đầu) → sort asc → 3 đầu. Thuần + deterministic mọi render/restart (KHÔNG
 * Math.random). Vector pin dưới tính bằng script oracle ĐỘC LẬP cùng rule —
 * đổi thuật toán selection = phảiconscious update pin.
 */
describe("QUEST_POOL — 7 quest đúng spec §2.4", () => {
  it("đúng 7 id, không trùng", () => {
    const ids = QUEST_POOL.map((d) => d.questId);
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
    expect(ids).toEqual([
      "q-parts-3",
      "q-parts-5",
      "q-listen-goal",
      "q-review-5",
      "q-plant-3",
      "q-goal-words",
      "q-goal-dual",
    ]);
  });

  it("target tĩnh đúng mốc: parts-3=3 · parts-5=5 · review-5=5 · plant-3=3 · goal-dual=2", () => {
    const byId = new Map(QUEST_POOL.map((d) => [d.questId, d]));
    expect(byId.get("q-parts-3")?.target).toBe(3);
    expect(byId.get("q-parts-5")?.target).toBe(5);
    expect(byId.get("q-review-5")?.target).toBe(5);
    expect(byId.get("q-plant-3")?.target).toBe(3);
    // q-goal-dual: progress = số goal con (0..2), target 2
    expect(byId.get("q-goal-dual")?.target).toBe(2);
    // 2 quest goal động resolve target từ snapshot (dailyGoalMinutes/Words)
    expect(byId.get("q-listen-goal")?.target).toBe("goalMinutes");
    expect(byId.get("q-goal-words")?.target).toBe("goalWords");
  });

  it("defs CHỈ id + target + metric — không chứa i18n (SF-3 điền today.json)", () => {
    for (const def of QUEST_POOL) {
      expect(Object.keys(def).sort()).toEqual(["metric", "questId", "target"]);
    }
  });
});

describe("selectQuests — deterministic SHA-256 (spec §2.4)", () => {
  it("vector pin 1: qa-user-1 / 2026-10-13", () => {
    expect(selectQuests("qa-user-1", "2026-10-13")).toEqual([
      "q-goal-dual",
      "q-parts-5",
      "q-goal-words",
    ]);
  });

  it("vector pin 2: qa-today-42 / 2026-01-01", () => {
    expect(selectQuests("qa-today-42", "2026-01-01")).toEqual([
      "q-review-5",
      "q-goal-words",
      "q-parts-5",
    ]);
  });

  it("vector pin 3: user-x / 2025-12-31", () => {
    expect(selectQuests("user-x", "2025-12-31")).toEqual([
      "q-goal-words",
      "q-review-5",
      "q-parts-3",
    ]);
  });

  it("cùng input → cùng 3 quest (100 lần, mọi server)", () => {
    const once = selectQuests("qa-user-1", "2026-10-13");
    for (let i = 0; i < 100; i++) {
      expect(selectQuests("qa-user-1", "2026-10-13")).toEqual(once);
    }
  });

  it("đúng 3 quest DISTINCT, đều thuộc pool — quét 500 (userId, date)", () => {
    const poolIds = new Set(QUEST_POOL.map((d) => d.questId));
    const seen = new Set<QuestId>();
    for (let i = 0; i < 500; i++) {
      const picks = selectQuests(
        `u${i}`,
        `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
      );
      expect(picks).toHaveLength(3);
      expect(new Set(picks).size).toBe(3);
      for (const id of picks) {
        expect(poolIds.has(id)).toBe(true);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(7); // 500 vector phủ đủ pool — không quest bị kẹt
  });
});
