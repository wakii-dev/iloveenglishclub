import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { getBook, getLesson } from "@/lib/content/queries";

/**
 * OG image động cho lesson (SF-7 spec §4.5) — palette B "Classroom Warm"
 * (hand-off vu15-dictation-direction). Locale lấy từ params (image route bị
 * middleware loại — requestLocale không đáng tin) + getTranslations explicit.
 * Không DB (build/CI) → generic fallback brand + site name. Default satori
 * font (offline-safe). Static EN alt — single-image convention không nhận
 * params (spec §4.5, ghi nhận).
 */
export const alt = "Dictation lesson — I Love English Club";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

const C = {
  bg: "#fff8f0",
  fg: "#432818",
  primary: "#e85d3d",
  secondary: "#0e9488",
  mutedFg: "#8a6b52",
  border: "#f3e2ce",
} as const;

export default async function Image({
  params,
}: {
  params: Promise<{
    locale: string;
    book: string;
    unit: string;
    lesson: string;
  }>;
}) {
  const { locale, book, unit, lesson } = await params;
  const [t, lessonRow, bookRow] = await Promise.all([
    getTranslations({ locale, namespace: "seo" }),
    getLesson(book, unit, lesson, locale),
    getBook(book, locale),
  ]);

  const title = lessonRow?.title ?? t("homeTitle").split("—")[0].trim();
  const bookTitle = bookRow?.title ?? "";
  const cefr = bookRow?.cefrLabel ?? "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: C.bg,
          padding: 56,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: C.primary,
              borderRadius: 18,
              color: "#ffffff",
              fontSize: 34,
            }}
          >
            ♥
          </div>
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              color: C.fg,
              display: "flex",
            }}
          >
            I Love English Club
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            background: "#ffffff",
            border: `4px solid ${C.border}`,
            borderRadius: 28,
            padding: 44,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {cefr ? (
              <div
                style={{
                  display: "flex",
                  background: C.secondary,
                  color: "#ffffff",
                  borderRadius: 999,
                  padding: "8px 26px",
                  fontSize: 26,
                  fontWeight: 700,
                }}
              >
                {cefr}
              </div>
            ) : null}
            {bookTitle ? (
              <div
                style={{
                  display: "flex",
                  color: C.mutedFg,
                  fontSize: 28,
                  fontWeight: 600,
                }}
              >
                {bookTitle}
              </div>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 60 ? 52 : 64,
              fontWeight: 700,
              color: C.fg,
              lineHeight: 1.15,
            }}
          >
            {title}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            color: C.primary,
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          {t("ogListenType")}
        </div>
      </div>
    ),
    { ...size },
  );
}
