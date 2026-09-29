import { describe, expect, it } from "vitest";
import { routing } from "./routing";

describe("i18n routing config (spec §8)", () => {
  it("hỗ trợ đúng 2 locale: en + vi", () => {
    expect(routing.locales).toEqual(["en", "vi"]);
  });

  it("default locale là en (redirect `/` → `/en`)", () => {
    expect(routing.defaultLocale).toBe("en");
  });

  it("localePrefix always — mọi route có prefix locale", () => {
    expect(routing.localePrefix).toBe("always");
  });
});
