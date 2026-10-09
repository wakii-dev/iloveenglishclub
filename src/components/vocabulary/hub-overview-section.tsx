import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  DashboardBookLevelsProgress,
} from "@/components/vocabulary/dashboard-book-levels-progress";
import { DashboardContinueCard } from "@/components/vocabulary/dashboard-continue-card";
import { DashboardGardenStrip } from "@/components/vocabulary/dashboard-garden-strip";
import { DashboardStatsRow } from "@/components/vocabulary/dashboard-stats-row";
import { DashboardThemeToggle } from "@/components/vocabulary/dashboard-theme-toggle";
import { BookStudyButton } from "@/components/vocabulary/book-study-button";
import { localize } from "@/lib/content/localize";
import {
  getBookLevelProgresses,
  getContinueTarget,
  getDashboardSummary,
  getGardenDistribution,
} from "@/lib/vocabulary/dashboard-store";
import { listDiscoverBooks } from "@/lib/vocabulary/hub-store";

export const DASHBOARD_CONTAINER_ID = "vocab-dashboard";

/**
 * Icon dcards Khám phá (copy proto-A + attrs `.ic`: stroke currentColor
 * 2.2 fill none — không có thì SVG render fill đen đặc, review B P1) —
 * xoay theo index.
 */
const DISCOVER_ICONS = [
  // Học theo sách
  <svg key="book" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="block" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 3v18M13 7h3M13 11h3" />
  </svg>,
  // Quiz từ vựng
  <svg key="quiz" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="block" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r=".8" fill="currentColor" />
  </svg>,
  // Bảng xếp hạng
  <svg key="trophy" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="block" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 21h8M12 17v4M7 4h10v4.5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3.2 4M17 6h3a3 3 0 0 1-3.2 4" />
  </svg>,
] as const;
const DISCOVER_ICON_STYLES = [
  "bg-teal-soft text-secondary",
  "bg-gold-soft text-gold",
  "bg-leaf-soft text-leaf-deep",
] as const;

/**
 * Tab Tổng quan = DASHBOARD Memrise-style (vocab-memrise SF-4, VU-41 —
 * hand-off `vocab-memrise-direction.md` §2.1, proto-A source of truth): đầu
 * trang ngày + "Chào {name}" + pill XP · continue card · stat row (goal
 * ring / streak / due) · vườn 8 stage · lộ trình sách · Khám phá (GIỮ logic
 * listDiscoverBooks + BookStudyButton — chỉ đổi hình hài dcard, context pack
 * boundary). Desktop ≥900 (lg): 2 cột — trái continue+stats+khám phá, phải
 * vườn+lộ trình. Data cá nhân → query live; guest không bao giờ render
 * (page điều phối, tab contract ?tab= giữ nguyên). Class `dark` scope CHỈ
 * container này (toggle client + localStorage ilec.vocab-theme — hand-off §4).
 */
export async function HubOverviewSection({
  userId,
  locale,
  now,
  name,
}: {
  userId: string;
  locale: string;
  now: Date;
  name: string | null;
}) {
  const t = await getTranslations("vocabulary");
  const tl = await getTranslations("learn");
  const [summary, distribution, continueCard, levelBooks, discover] =
    await Promise.all([
      getDashboardSummary(userId, now),
      getGardenDistribution(userId),
      getContinueTarget(userId),
      getBookLevelProgresses(userId),
      listDiscoverBooks(userId),
    ]);

  const dateLine = new Intl.DateTimeFormat(
    locale === "vi" ? "vi-VN" : "en-US",
    { weekday: "long", day: "numeric", month: "long" },
  ).format(now);
  const xpLine = new Intl.NumberFormat(
    locale === "vi" ? "vi-VN" : "en-US",
  ).format(summary.totalXp);

  return (
    // scope dark (hand-off §4): container = surface riêng — dark mode đổi cả
    // nền (bg-background) + text (text-foreground) trong phạm vi, nền page
    // ngoài (tab strip/library) giữ nguyên; -mx-5/p-5 bù để mép nội dung
    // khớp tab strip, light mode nền kem-trên-kem vô hình
    <div
      id={DASHBOARD_CONTAINER_ID}
      className="-mx-5 rounded-[24px] bg-background p-5 text-foreground"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted-foreground">{dateLine}</p>
          <h1 className="font-display text-[27px] leading-tight font-extrabold">
            {t("hub.dash.greeting", {
              name: name ?? t("hub.dash.greetingFallback"),
            })}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border-[1.5px] border-gold-soft-line bg-gold-soft px-3.5 py-2 font-display text-[14.5px] font-bold tabular-nums text-gold">
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" className="block">
              <path
                d="M12 2l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.2 1.3-6.6L2.5 9l6.6-.8L12 2z"
                fill="currentColor"
              />
            </svg>
            {t("hub.dash.xpPill", { count: xpLine })}
          </span>
          <DashboardThemeToggle containerId={DASHBOARD_CONTAINER_ID} />
        </div>
      </div>

      {levelBooks.length === 0 ? (
        <p className="rounded-[14px] border-2 border-dashed border-border p-5 text-center text-[14px] font-semibold text-muted-foreground">
          {t("hub.emptyAll")}{" "}
          <Link
            href="/books"
            className="text-primary underline-offset-2 hover:underline focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            {t("hub.ctaBrowseBooks")}
          </Link>
        </p>
      ) : (
        <>
          {/* ≥900px 2 cột (hand-off §2.1 — lg=1024 chật 900-1023, review B P2) */}
        <div className="min-[900px]:grid min-[900px]:grid-cols-[1.1fr_.9fr] min-[900px]:items-start min-[900px]:gap-3.5">
          <div>
            {continueCard !== null ? (
              <DashboardContinueCard card={continueCard} locale={locale} t={t} />
            ) : null}
            <DashboardStatsRow summary={summary} t={t} />
          </div>

          <div>
            <DashboardGardenStrip distribution={distribution} t={t} tl={tl} />
            <DashboardBookLevelsProgress books={levelBooks} locale={locale} t={t} />
          </div>
        </div>

        {/* Khám phá full-width sau cùng — đúng proto (.discover ngoài .cols) */}
        {discover.length > 0 ? (
          <section aria-label={t("hub.discover.title")} className="mt-5">
            <h2 className="mb-2.5 font-display text-[19px] font-extrabold">
              {t("hub.discover.title")}
            </h2>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {discover.map((book, i) => (
                <div
                  key={book.id}
                  className="flex flex-col gap-2.5 rounded-[18px] border-[1.5px] border-border bg-card p-3.5"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-11 w-11 flex-none place-items-center rounded-[14px] ${DISCOVER_ICON_STYLES[i % 3]}`}
                      aria-hidden="true"
                    >
                      {DISCOVER_ICONS[i % 3]}
                    </span>
                    <span className="min-w-0">
                      <b className="block truncate text-[14.5px]">
                        {localize(locale, {
                          en: book.titleEn,
                          vi: book.titleVi,
                        })}
                      </b>
                      <span className="block text-[12px] tabular-nums text-muted-foreground">
                        {t("hub.discover.unlearned", { count: book.unlearned })}
                      </span>
                    </span>
                  </div>
                  <BookStudyButton
                    bookId={book.id}
                    locale={locale}
                    nextPath={`/${locale}/vocabulary`}
                  />
                </div>
              ))}
            </div>
          </section>
        ) : null}
        </>
      )}
    </div>
  );
}
