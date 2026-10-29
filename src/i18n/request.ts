import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { routing } from "./routing";

/**
 * Messages PER-NAMESPACE: messages/{locale}/{namespace}.json
 * (ilec: tách namespace ngay từ đầu để Tier 2 song song không conflict;
 * loader merge mọi file trong thư mục locale thành 1 object)
 *
 * ilec-v2 (Next 16 + cacheComponents) — 2 thích nghi so với ilec:
 * 1. Locale đọc qua `rootParams.locale()` (requestLocale/setRequestLocale
 *    KHÔNG tương thích cacheComponents — next-intl blog "Using
 *    next/root-params in Next.js 16.3" + issue #1493). Validate runtime cho
 *    locale lạ → notFound().
 * 2. Messages nạp bằng static import (catalog dưới) thay vì fs.readdir/
 *    readFile runtime — IO runtime trong request config chặn prerender
 *    (build fail "uncached or runtime data"). Import tĩnh được inline lúc
 *    build. THÊM namespace mới = thêm import + 2 dòng catalog (en + vi).
 */
import enToday from "../../messages/en/today.json";
import viToday from "../../messages/vi/today.json";
import enVocabCatalog from "../../messages/en/vocab-catalog.json";
import viVocabCatalog from "../../messages/vi/vocab-catalog.json";
import enVocabCmsCommon from "../../messages/en/vocab-cms-common.json";
import viVocabCmsCommon from "../../messages/vi/vocab-cms-common.json";
import enVocabCuration from "../../messages/en/vocab-curation.json";
import viVocabCuration from "../../messages/vi/vocab-curation.json";
import enVocabStats from "../../messages/en/vocab-stats.json";
import viVocabStats from "../../messages/vi/vocab-stats.json";
import enAdmin from "../../messages/en/admin.json";
import enAuth from "../../messages/en/auth.json";
import enBooks from "../../messages/en/books.json";
import enCommon from "../../messages/en/common.json";
import enErrors from "../../messages/en/errors.json";
import enGamification from "../../messages/en/gamification.json";
import enHome from "../../messages/en/home.json";
import enLearn from "../../messages/en/learn.json";
import enLesson from "../../messages/en/lesson.json";
import enSeo from "../../messages/en/seo.json";
import enVocabulary from "../../messages/en/vocabulary.json";
import viAdmin from "../../messages/vi/admin.json";
import viAuth from "../../messages/vi/auth.json";
import viBooks from "../../messages/vi/books.json";
import viCommon from "../../messages/vi/common.json";
import viErrors from "../../messages/vi/errors.json";
import viGamification from "../../messages/vi/gamification.json";
import viHome from "../../messages/vi/home.json";
import viLearn from "../../messages/vi/learn.json";
import viLesson from "../../messages/vi/lesson.json";
import viSeo from "../../messages/vi/seo.json";
import viVocabulary from "../../messages/vi/vocabulary.json";

const CATALOGS = {
  en: {
    today: enToday,
    'vocab-stats': enVocabStats,
    'vocab-curation': enVocabCuration,
    'vocab-cms-common': enVocabCmsCommon,
    'vocab-catalog': enVocabCatalog,
    admin: enAdmin,
    auth: enAuth,
    books: enBooks,
    common: enCommon,
    errors: enErrors,
    gamification: enGamification,
    home: enHome,
    learn: enLearn,
    lesson: enLesson,
    seo: enSeo,
    vocabulary: enVocabulary,
  },
  vi: {
    today: viToday,
    'vocab-stats': viVocabStats,
    'vocab-curation': viVocabCuration,
    'vocab-cms-common': viVocabCmsCommon,
    'vocab-catalog': viVocabCatalog,
    admin: viAdmin,
    auth: viAuth,
    books: viBooks,
    common: viCommon,
    errors: viErrors,
    gamification: viGamification,
    home: viHome,
    learn: viLearn,
    lesson: viLesson,
    seo: viSeo,
    vocabulary: viVocabulary,
  },
} as const;

export default getRequestConfig(async ({ locale: override }) => {
  let locale: string;
  if (override) {
    // Explicit từ caller (getTranslations({locale}) — route handler/action)
    locale = override;
  } else {
    const paramValue = await rootParams.locale();
    if (!hasLocale(routing.locales, paramValue)) {
      notFound();
    }
    locale = paramValue;
  }

  return {
    locale,
    messages: CATALOGS[locale as keyof typeof CATALOGS],
  };
});
