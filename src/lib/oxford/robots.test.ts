import { describe, expect, it } from "vitest";
import { assertCrawlAllowed, isAllowed, parseRobots, RobotsDeniedError } from "./robots";

// Excerpt THẬT robots.txt Oxford (fetch 2026-10-04 — UA ILEC-VocabBot):
// nhóm AI-brand Disallow toàn site + nhóm * Disallow các path nhạy cảm.
const REAL_ROBOTS = `User-agent: anthropic-ai
User-agent: CCBot
User-agent: ChatGPT-User
User-agent: Claude-Web
User-agent: GPTBot
Disallow: /

User-agent: AmazonAdBot
Sitemap: https://www.oxfordlearnersdictionaries.com/sitemap.xml
Disallow: /info/
Disallow: /definition/academic/
Disallow: /definition/collocations/

User-agent: *
Sitemap: https://www.oxfordlearnersdictionaries.com/sitemap.xml
Disallow: /info/
Disallow: /autocomplete/
Disallow: /definition/academic/
Disallow: /definition/collocations/
Disallow: /pronunciation/
Disallow: /search/
Disallow: /search
`;

describe("parseRobots — nhóm User-agent: *", () => {
  it("lấy đúng Disallow của nhóm *, KHÔNG lẫn nhóm khác (nhóm AI-brand Disallow /)", () => {
    const policy = parseRobots(REAL_ROBOTS, "*");
    expect(policy.disallowed).toContain("/info/");
    expect(policy.disallowed).toContain("/definition/academic/");
    expect(policy.disallowed).not.toContain("/"); // Disallow / thuộc nhóm AI-brand
  });

  it("nhóm UA liền nhau gộp 1 nhóm; nhóm mới reset (không tích lũy chéo)", () => {
    const policy = parseRobots(REAL_ROBOTS, "AmazonAdBot");
    expect(policy.disallowed).toEqual(["/info/", "/definition/academic/", "/definition/collocations/"]);
  });

  it("UA nhóm AI-brand → Disallow toàn site (chính là lý do KHÔNG dùng UA AI)", () => {
    const policy = parseRobots(REAL_ROBOTS, "GPTBot");
    expect(isAllowed(policy, "/definition/english/tree")).toBe(false);
  });

  it("robots rỗng → luật rỗng = cho phép hết", () => {
    expect(parseRobots("", "*").disallowed).toEqual([]);
  });
});

describe("isAllowed — prefix match", () => {
  const policy = parseRobots(REAL_ROBOTS, "*");
  it("/definition/english/tree được phép", () => {
    expect(isAllowed(policy, "/definition/english/tree")).toBe(true);
  });
  it("/definition/academic/ + /search bị chặn", () => {
    expect(isAllowed(policy, "/definition/academic/apology")).toBe(false);
    expect(isAllowed(policy, "/search?q=tree")).toBe(false);
  });
});

describe("assertCrawlAllowed — runtime guard", () => {
  it("/definition/english/ được phép (robots thật 2026-10-04) → không throw", async () => {
    await expect(
      assertCrawlAllowed("/definition/english/tree", { robotsText: REAL_ROBOTS }),
    ).resolves.toBeUndefined();
  });

  it("Disallow /definition/english/ xuất hiện → RobotsDeniedError (runner từ chối)", async () => {
    const hostile = REAL_ROBOTS + "Disallow: /definition/english/\n";
    await expect(
      assertCrawlAllowed("/definition/english/tree", { robotsText: hostile }),
    ).rejects.toBeInstanceOf(RobotsDeniedError);
  });

  it("fetch robots.txt thật qua fetchImpl inject", async () => {
    let calledUrl = "";
    await assertCrawlAllowed("/definition/english/tree", {
      fetchImpl: async (url) => {
        calledUrl = String(url);
        return new Response(REAL_ROBOTS, { status: 200 });
      },
    });
    expect(calledUrl).toBe("https://www.oxfordlearnersdictionaries.com/robots.txt");
  });
});
