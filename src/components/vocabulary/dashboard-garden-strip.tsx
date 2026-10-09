import type { VocabT } from "@/components/vocabulary/dashboard-types";
import { StagePlant } from "@/components/vocabulary/dashboard-stage-icons";

/**
 * Garden band (vocab-memrise SF-4, VU-41 — hand-off §2.1 khối 4): nền
 * `--garden` radius 24, 8 cây SVG trên ground-line (border-bottom 2.5px
 * wave-dim), số đếm Baloo dưới mỗi cây, chú thích tên stage (legend-ink,
 * labels từ learn.stage.0..7 SF-1). A11y: section aria-label phân bố
 * (acceptance #6 — text alternative); số đếm là text thật.
 * SYNC + translators qua props (t=vocabulary, tl=learn) — test SSR pin.
 */
export function DashboardGardenStrip({
  distribution,
  t,
  tl,
}: {
  distribution: number[];
  t: VocabT;
  tl: VocabT;
}) {
  const total = distribution.reduce((sum, n) => sum + n, 0);

  return (
    <section
      aria-label={t("hub.dash.gardenAria")}
      className="mb-5 rounded-[24px] bg-garden px-4 pt-4.5 pb-3.5"
    >
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="font-display text-[19px] font-extrabold">
          {t("hub.dash.gardenTitle")}
        </h2>
        <span className="text-[12.5px] font-bold tabular-nums text-leaf-deep">
          {t("hub.dash.gardenGrowing", { count: total })}
        </span>
      </div>
      <div className="flex gap-1 border-b-2.5 border-wave-dim px-1">
        {distribution.map((count, stage) => (
          <span key={stage} className="flex flex-1 flex-col items-center gap-0.5">
            <StagePlant stage={stage} />
            <b className="font-display text-[15px] tabular-nums text-leaf-deep">
              {count}
            </b>
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-2.5 gap-y-1">
        {distribution.map((_, stage) => (
          <span
            key={stage}
            className="text-[11.5px] font-semibold tabular-nums text-legend-ink"
          >
            {stage} {tl(`stage.${stage}`)}
          </span>
        ))}
      </div>
    </section>
  );
}
