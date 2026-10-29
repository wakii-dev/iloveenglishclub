import type { MetadataRoute } from "next";
import {
  bookPath,
  getPublishedLessonRows,
  lessonPath,
  unitPath,
} from "@/lib/seo/sitemap-data";
import {
  absoluteUrl,
  buildAlternates,
  localePath,
} from "@/lib/seo/site";
import { routing } from "@/i18n/routing";

/**
 * /sitemap.xml (SF-7 spec §4.4): static routes LUÔN có (kể cả build không DB);
 * phần DB-derived derive từ tập published lessons — unit/book không còn
 * published lesson tự biến mất. Đủ cặp locale + hreflang cặp trong từng entry
 * (bổ trợ link tags). lastModified omit — lessons không có updated_at.
 */

function entry(locale: string, path: string): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteUrl(localePath(locale, path)),
    alternates: { languages: buildAlternates(locale, path).languages },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = ["", "/books"];
  const staticEntries = routing.locales.flatMap((locale) =>
    staticPaths.map((path) => entry(locale, path)),
  );

  const rows = await getPublishedLessonRows();
  if (rows.length === 0) return staticEntries;

  const bookSlugs = [...new Set(rows.map((r) => r.bookSlug))];
  // Map giữ nguyên object (review P2: không re-parse qua chuỗi — slug có
  // space/ký tự lạ vẫn đúng)
  const unitMap = new Map(
    rows.map((r) => [
      `${r.bookSlug}:${r.unitNumber}`,
      { bookSlug: r.bookSlug, unitNumber: r.unitNumber },
    ]),
  );
  const unitRows = [...unitMap.values()];

  const dbPaths: string[] = [
    ...bookSlugs.map(bookPath),
    ...unitRows.map(({ bookSlug, unitNumber }) => unitPath(bookSlug, unitNumber)),
    ...rows.map((r) => lessonPath(r.bookSlug, r.unitNumber, r.lessonNumber)),
  ];

  return [
    ...staticEntries,
    ...routing.locales.flatMap((locale) =>
      dbPaths.map((path) => entry(locale, path)),
    ),
  ];
}
