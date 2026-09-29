/**
 * Fallback render chain `vi → en → raw` (spec §8) cho mọi cột content.
 * Pure module — không import DB (scripts/ dùng được qua relative import).
 * Chuỗi rỗng/whitespace coi như thiếu → rơi xuống mức kế (không hiện rỗng).
 */
export type LocalizedText = { en: string | null; vi: string | null };

function orNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function localize(
  locale: string,
  text: LocalizedText,
  fallbackRaw?: string,
): string {
  const en = orNull(text.en);
  const vi = orNull(text.vi);
  if (locale === "vi") {
    return vi ?? en ?? orNull(fallbackRaw) ?? "";
  }
  return en ?? vi ?? orNull(fallbackRaw) ?? "";
}
