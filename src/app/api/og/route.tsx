import { ImageResponse } from "next/og";

/**
 * OG image mặc định qua Route Handler /api/og (user 2026-09-29: link preview
 * thiếu image). Dùng Route Handler thay file convention ở [locale] vì
 * [locale]/[...rest] catch-all (styled 404) nuốt /en/opengraph-image khi trùng
 * cấp. Metadata tập trung set openGraph.images = /api/og trong
 * lib/seo/metadata.ts; book/lesson giữ file-convention riêng (override).
 * Palette B Classroom Warm (hand-off §1.1) + motif waveform.
 */
const C = {
  bg: "#fff8f0",
  fg: "#432818",
  primary: "#e85d3d",
  secondary: "#0e9488",
  mutedFg: "#8a6b52",
  border: "#f3e2ce",
} as const;

/** Waveform heights (hand-off §1.9) — motif "sound becomes text". */
const WAVE = [22, 40, 64, 38, 80, 52, 30, 58, 88, 44, 26, 60, 74, 36, 48, 70, 32, 56, 84, 40, 24, 62, 46, 34];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale") === "vi" ? "vi" : "en";
  const heroTitle =
    locale === "vi"
      ? "Nghe thật kỹ. Gõ lại thật đúng."
      : "Master English listening, one sentence at a time.";
  const kicker = locale === "vi" ? "LUYỆN NGHE CHÉP CHÍNH TẢ" : "DICTATION PRACTICE";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: C.bg,
        }}
      >
        {/* header band — coral + brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: C.primary,
            padding: "32px 56px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "#ffffff",
                transform: "rotate(-6deg)",
                fontSize: 34,
              }}
            >
              ❤️
            </div>
            <div
              style={{
                display: "flex",
                color: "#ffffff",
                fontSize: 34,
                fontWeight: 700,
              }}
            >
              I Love English Club
            </div>
          </div>
          <div
            style={{
              display: "flex",
              color: "#ffffff",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 2,
            }}
          >
            {kicker}
          </div>
        </div>

        {/* hero — headline + waveform */}
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            gap: 36,
            padding: "0 56px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 68,
              fontWeight: 700,
              color: C.fg,
              lineHeight: 1.15,
              maxWidth: 1000,
            }}
          >
            {heroTitle}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 76 }}>
            {WAVE.map((h, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  width: 14,
                  height: `${h}%`,
                  borderRadius: 6,
                  background: i < 10 ? C.secondary : C.border,
                }}
              />
            ))}
            <div
              style={{
                display: "flex",
                marginLeft: 24,
                color: C.mutedFg,
                fontSize: 28,
                fontWeight: 600,
              }}
            >
              Listen · Type · Check · Read aloud
            </div>
          </div>
        </div>

        {/* footer — levels path */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "32px 56px",
            borderTop: `3px solid ${C.border}`,
          }}
        >
          <div style={{ display: "flex", color: C.mutedFg, fontSize: 26, fontWeight: 600 }}>
            Cambridge English Prepare — Pre-A1 → B2 First
          </div>
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
            7 levels · Free core
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
