import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { routing } from "./routing";

/**
 * Messages PER-NAMESPACE: messages/{locale}/{namespace}.json
 * (context pack SF-1 — tách namespace ngay từ đầu để Tier 2 song song
 * không conflict; loader merge mọi file trong thư mục locale thành 1 object)
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const dir = path.join(process.cwd(), "messages", locale);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const messages = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => {
        const namespace = path.basename(file, ".json");
        const content = await readFile(path.join(dir, file), "utf8");
        return [namespace, JSON.parse(content)];
      }),
    ),
  );

  return { locale, messages };
});
