import type { VocabT } from "@/components/vocabulary/dashboard-types";
import { Link } from "@/i18n/navigation";
import { localize } from "@/lib/content/localize";
import type { ContinueCard as ContinueCardData } from "@/lib/vocabulary/dashboard-store";

/**
 * Continue card hero (vocab-memrise SF-4, VU-41 — hand-off §2.1 khối 2):
 * tag "HỌC TIẾP" teal-soft · tên sách Baloo 22 · meta "Level N · Từ X–Y —
 * còn k từ mới trong level" · progress 8px teal (planted/10 trong level) ·
 * CTA coral full-width → /vocabulary/learn/[book] (route SF-3 — plain <Link>,
 * 404 interim CHẤP NHẬN, KHÔNG tự tạo route). Sách hoàn thành → CTA disabled
 * + tag "Hoàn thành" — không link sang level rỗng (acceptance #4).
 * Watermark lá `--garden` opacity .5 góc phải. Progress role="img" aria.
 * SYNC + translator qua props (entry fetch) — test SSR renderToString pin.
 */
export function DashboardContinueCard({
  card,
  locale,
  t,
}: {
  card: ContinueCardData;
  locale: string;
  t: VocabT;
}) {
  return (
    <article className="relative mb-3.5 overflow-hidden rounded-[24px] border-[1.5px] border-border bg-card p-5 shadow-dash-card">
      {/* watermark lá — copy proto-A, fill currentColor màu --garden */}
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -top-4.5 h-[150px] w-[150px] text-garden opacity-50"
      >
        <path
          d="M50 92C22 92 8 72 8 44 36 44 50 60 50 92zm0 0c0-28 14-48 42-48 0 28-14 44-42 44z"
          fill="currentColor"
        />
        <circle cx="24" cy="26" r="5" fill="currentColor" opacity=".5" />
      </svg>

      {card.completed ? (
        <>
          {/* hoàn thành: tag đổi, TÊN SÁCH vẫn hiện (hand-off §2.1 khối 2) */}
          <span className="mb-2 inline-block rounded-full bg-leaf-soft px-2.5 py-1 text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-leaf-deep">
            {t("hub.dash.continueDoneTag")}
          </span>
          <h2 className="font-display text-[22px] font-extrabold">
            {localize(locale, { en: card.titleEn, vi: card.titleVi })}
          </h2>
          <p className="my-2.5 text-[14px] text-muted-foreground">
            {t("hub.dash.continueMetaDone")}
          </p>
          <button
            type="button"
            disabled
            aria-disabled
            className="mt-4.5 flex min-h-[54px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-primary/50 font-display text-[17.5px] font-bold text-primary-foreground"
          >
            {t("hub.dash.continueDoneTag")}
          </button>
        </>
      ) : (
        (() => {
          const level = card.level;
          const plantedInLevel = level.words.filter((w) => w.reps > 0).length;
          const total = level.words.length;
          const from = Math.min(...level.words.map((w) => w.order));
          const to = Math.max(...level.words.map((w) => w.order));
          return (
            <>
              <span className="mb-2 inline-block rounded-full bg-teal-soft px-2.5 py-1 text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-secondary">
                {t("hub.dash.continueTag")}
              </span>
              <h2 className="font-display text-[22px] font-extrabold">
                {localize(locale, { en: card.titleEn, vi: card.titleVi })}
              </h2>
              <p className="my-2.5 text-[14px] tabular-nums text-muted-foreground">
                {t("hub.dash.continueMeta", {
                  level: level.levelIndex + 1,
                  from,
                  to,
                  count: card.newCount,
                })}
              </p>
              <div
                role="img"
                aria-label={t("hub.dash.continueProgressAria", {
                  level: level.levelIndex + 1,
                  planted: plantedInLevel,
                  total,
                })}
                className="mb-1.5 h-2 overflow-hidden rounded-full bg-muted"
              >
                <i
                  className="block h-full rounded-full bg-secondary"
                  style={{ width: `${total === 0 ? 0 : Math.round((plantedInLevel / total) * 100)}%` }}
                />
              </div>
              <span className="mb-1 block text-[12.5px] tabular-nums text-muted-foreground">
                {t("hub.dash.continueProgressNum", { planted: plantedInLevel, total })}
              </span>
              <Link
                href={`/vocabulary/learn/${card.slug}`}
                className="mt-4.5 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-primary font-display text-[17.5px] font-bold text-primary-foreground shadow-[0_4px_0_var(--coral-deep)] transition-transform active:translate-y-[3px] active:shadow-[0_1px_0_var(--coral-deep)]"
              >
                {t("hub.dash.continueCta", { count: card.newCount })}
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="block">
                  <path
                    d="M9 5l7 7-7 7"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </>
          );
        })()
      )}
    </article>
  );
}
