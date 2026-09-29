import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { getBook } from "@/lib/content/queries";

/**
 * OG image động cho book (SF-7 spec §4.5) — deviation có chủ đích: slice #4
 * nói "cho lesson" nhưng touch map pack liệt kê opengraph-image (lesson + book)
 * — theo touch map. Khối màu theo book.color + title + CEFR + counts.
 * Không DB → generic fallback. Palette B Classroom Warm.
 */
export const alt = "Course level — I Love English Club";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

const C = {
  bg: "#fff8f0",
  fg: "#432818",
  primary: "#e85d3d",
  mutedFg: "#8a6b52",
  border: "#f3e2ce",
  card: "#ffffff",
} as const;

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; book: string }>;
}) {
  const { locale, book } = await params;
  const [t, bookRow] = await Promise.all([
    getTranslations({ locale, namespace: "seo" }),
    getBook(book, locale),
  ]);

  const title = bookRow?.title ?? t("homeTitle").split("—")[0].trim();
  const color = bookRow?.color ?? C.primary;
  const cefr = bookRow?.cefrLabel ?? "";
  const description =
    bookRow?.description ?? t("homeDescription").split("—")[1]?.trim() ?? "";
  const counts = bookRow
    ? `${bookRow.unitCount} units · ${bookRow.lessonCount} lessons`
    : "iloveenglish.club";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: C.bg,
          padding: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: color,
            padding: "36px 56px",
          }}
        >
          <div
            style={{
              display: "flex",
              color: "#ffffff",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            I Love English Club
          </div>
          {cefr ? (
            <div
              style={{
                display: "flex",
                background: "#ffffff",
                color: C.fg,
                borderRadius: 999,
                padding: "8px 26px",
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              {cefr}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            gap: 26,
            padding: "0 56px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: title.length > 40 ? 60 : 76,
              fontWeight: 700,
              color: C.fg,
              lineHeight: 1.1,
            }}
          >
            {title}
          </div>
          {description ? (
            <div
              style={{
                display: "flex",
                color: C.mutedFg,
                fontSize: 30,
                lineHeight: 1.35,
              }}
            >
              {description}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "36px 56px",
            borderTop: `3px solid ${C.border}`,
          }}
        >
          <div
            style={{ display: "flex", color: C.mutedFg, fontSize: 26, fontWeight: 600 }}
          >
            {counts}
          </div>
          <div
            style={{
              display: "flex",
              color: C.primary,
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            Listen · Type · Check
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
