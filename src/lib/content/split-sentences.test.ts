import { describe, expect, it } from "vitest";
import { splitSentences } from "./split-sentences";

describe("splitSentences — chia theo .?! giữ dấu câu (spec §6, context pack mục 8)", () => {
  it("hai câu cơ bản, dấu câu đính từng câu", () => {
    expect(splitSentences("Hi. Bye.")).toEqual(["Hi.", "Bye."]);
  });

  it("hỗ trợ ? và !", () => {
    expect(splitSentences("What is it? Wow! Ok.")).toEqual([
      "What is it?",
      "Wow!",
      "Ok.",
    ]);
  });

  it("nhiều dấu liền '?!' vẫn 1 câu", () => {
    expect(splitSentences("What?! Really.")).toEqual(["What?!", "Really."]);
  });

  it("xuống dòng cũng là separator", () => {
    expect(splitSentences("One.\nTwo.")).toEqual(["One.", "Two."]);
  });

  it("nhiều khoảng trắng sau dấu câu vẫn tách sạch", () => {
    expect(splitSentences("One.   Two.  ")).toEqual(["One.", "Two."]);
  });

  it("không có dấu kết → 1 câu nguyên văn (trim)", () => {
    expect(splitSentences("  no terminal punct  ")).toEqual([
      "no terminal punct",
    ]);
  });

  it("chuỗi rỗng → []", () => {
    expect(splitSentences("")).toEqual([]);
  });

  it("chỉ whitespace → []", () => {
    expect(splitSentences("  \n\t ")).toEqual([]);
  });

  it("known-limitation (behavior chấp nhận spec §6): viết tắt Mr. tách sai", () => {
    expect(splitSentences("Mr. Smith came.")).toEqual([
      "Mr.",
      "Smith came.",
    ]);
  });

  it("known-limitation: số thập phân 3.5 tách sai", () => {
    expect(splitSentences("It costs 3.5 dollars.")).toEqual([
      "It costs 3.",
      "5 dollars.",
    ]);
  });

  it("known-limitation: ellipsis tách sai", () => {
    expect(splitSentences("Well... maybe.")).toEqual([
      "Well...",
      "maybe.",
    ]);
  });
});
