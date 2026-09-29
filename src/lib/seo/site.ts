/**
 * lib/seo — nguồn DUY NHẤT cho site URL + canonical/hreflang + description
 * composition (SF-7, spec §4.2). Pure module — mọi layout metadata import từ
 * đây, không tự nối env anywhere else.
 *
 * Prod phải set NEXT_PUBLIC_SITE_URL — thiếu → canonical/hreflang/sitemap rơi
 * localhost (surface cho SF-8 security/audit checkpoint).
 */

export const BRAND = "I Love English Club";

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "") ||
    "http://localhost:3000";
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path}`;
}

export function localePath(locale: string, path = ""): string {
  return `/${locale}${path}`;
}

export type Alternates = {
  canonical: string;
  languages: Record<string, string>;
};

/**
 * canonical theo locale + cặp hreflang en↔vi (spec §8) + x-default → en
 * (defaultLocale, khớp redirect `/` → `/en`).
 */
export function buildAlternates(locale: string, path = ""): Alternates {
  const languages: Record<string, string> = {};
  for (const l of ["en", "vi"]) {
    languages[l] = absoluteUrl(localePath(l, path));
  }
  return {
    canonical: absoluteUrl(localePath(locale, path)),
    languages: { ...languages, "x-default": languages.en },
  };
}

/**
 * composeDescription (critic P0/P1): localized rỗng/null (hoặc whitespace) →
 * fallback template với {var} thay bằng vars; brace không khớp giữ nguyên.
 * Bảo đảm meta description không bao giờ emit rỗng.
 */
export function composeDescription(
  localized: string | null | undefined,
  fallbackTemplate: string,
  vars: Record<string, string>,
): string {
  const trimmed = localized?.trim();
  if (trimmed) return trimmed;
  return fallbackTemplate.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? vars[key] : match,
  );
}
