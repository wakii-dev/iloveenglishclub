import type { getTranslations } from "next-intl/server";

/**
 * Translator type dùng chung dashboard components (VU-37 SF-4) — components
 * SYNC nhận `t` qua props (entry fetch) để renderToString SSR test chạy được
 * (async server children chỉ RSC renderer render được, không renderToString).
 */
export type VocabT = Awaited<ReturnType<typeof getTranslations>>;
