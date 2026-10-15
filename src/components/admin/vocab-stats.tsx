"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { callApi } from "@/lib/admin/crawl-client";
import type {
  BookStat,
  CefrBucket,
  CefrHistogram,
  CmsStats,
} from "@/lib/admin/cms-stats-store";
import { CEFR_LEVELS } from "@/lib/admin/vocabulary";

/**
 * Stats dashboard /admin/vocabulary/stats (VU-43 SF-4 t2-t5) — client wire
 * GET /api/admin/vocabulary/stats (SF-1): 5 thẻ số, histogram CEFR THUẦN CSS
 * (KHÔNG chart lib — spec §2.3 pin; dataviz: 1 series = 1 hue, untagged/other
 * muted; label + số dạng text nên screen-reader đọc được không cần màu),
 * bảng per-book sort words desc, panel crawl (reuse crawlStatsDb) + link sang
 * crawl dashboard VU-32 (KHÔNG làm lại control). Pure legs export để vitest
 * node test — UI render là e2e admin-vocabulary-stats.spec.ts.
 */

/** % coverage: 1 chữ số thập phân; 0 (hoặc mẫu số 0) → "0%" pin context pack. */
export function formatPercent(part: number, total: number): string {
  if (total <= 0 || part <= 0) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

/** Thứ tự buckets PIN §5.8: A1..C2 + untagged + other (đủ 8 kể cả 0). */
export const HISTOGRAM_ORDER = [...CEFR_LEVELS, "untagged", "other"] as const;

export function histogramRows(
  histogram: CefrHistogram,
): { key: CefrBucket; count: number }[] {
  return HISTOGRAM_ORDER.map((key) => ({ key, count: histogram[key] ?? 0 }));
}

/** Tổng buckets — e2e pin UI: tổng bars = tổng words (thẻ total). */
export function histogramTotal(histogram: CefrHistogram): number {
  return histogramRows(histogram).reduce((sum, r) => sum + r.count, 0);
}

/** Bảng per-book sort theo số words desc (pin context pack t4). */
export function bookRowsDesc(perBook: BookStat[]): BookStat[] {
  return [...perBook].sort((a, b) => b.words - a.words);
}

export async function fetchCmsStats(): Promise<CmsStats> {
  return callApi<CmsStats>("/api/admin/vocabulary/stats");
}

const CARD_KEYS = [
  "total",
  "audio",
  "image",
  "orphan",
  "enriched",
] as const;

type CardKey = (typeof CARD_KEYS)[number];

function cardValue(key: CardKey, stats: CmsStats): string {
  const { totals } = stats;
  switch (key) {
    case "total":
      return String(totals.words);
    case "audio":
      return formatPercent(totals.withAudio, totals.words);
    case "image":
      return formatPercent(totals.withImage, totals.words);
    case "orphan":
      return String(totals.orphan);
    case "enriched":
      return formatPercent(totals.enriched, totals.words);
  }
}

function histogramLabel(
  key: CefrBucket,
  t: (k: string) => string,
): string {
  return key === "untagged" || key === "other" ? t(`histogram.${key}`) : key;
}

export function VocabStats() {
  const t = useTranslations("vocabStats");
  const tc = useTranslations("admin.common");
  const [stats, setStats] = useState<CmsStats | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadStats = useCallback(async () => {
    setLoadError(false);
    try {
      setStats(await fetchCmsStats());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  if (stats === null) {
    return loadError ? (
      <Card className="rounded-[18px]">
        <CardContent className="flex flex-col items-start gap-3 px-5 py-5">
          <p role="alert" className="text-[14px] font-semibold text-destructive">
            {t("error")}
          </p>
          <Button variant="outline" onClick={() => void loadStats()}>
            <RefreshCw aria-hidden className="size-4" />
            {tc("retry")}
          </Button>
        </CardContent>
      </Card>
    ) : (
      <div
        className="grid grid-cols-2 gap-4 md:grid-cols-5"
        aria-busy="true"
        data-testid="stats-loading"
      >
        {CARD_KEYS.map((key) => (
          <Card key={key} className="rounded-[18px]">
            <CardContent className="space-y-2 px-4 py-4">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const rows = histogramRows(stats.cefrHistogram);
  const total = histogramTotal(stats.cefrHistogram);
  const books = bookRowsDesc(stats.perBook);

  return (
    <div className="space-y-6">
      {/* 5 thẻ số — data-testid cho e2e (format % pin: 1 thập phân, 0 → 0%) */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {CARD_KEYS.map((key) => (
          <Card key={key} className="rounded-[18px]">
            <CardContent className="px-4 py-4">
              <p
                className={`font-display text-[26px] font-bold tabular-nums leading-none ${
                  key === "orphan" && stats.totals.orphan > 0
                    ? "text-destructive"
                    : ""
                }`}
                data-testid={`stat-${key}`}
              >
                {cardValue(key, stats)}
              </p>
              <p className="mt-1.5 text-[12.5px] font-bold text-muted-foreground">
                {t(`cards.${key}`)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Histogram CEFR — horizontal bars thuần CSS. 1 series = 1 hue
          (bg-primary); untagged/other = muted (không phải cấp thật). Label +
          số dạng TEXT (li text) → a11y không phụ thuộc màu; bar aria-hidden. */}
      <Card className="rounded-[18px]">
        <CardHeader className="px-5 pt-5 pb-0">
          <CardTitle className="font-display text-[17px] font-bold">
            {t("histogram.title")}
          </CardTitle>
          <p className="mt-1 text-[12.5px] font-semibold text-muted-foreground">
            {t("histogram.hint")}
          </p>
        </CardHeader>
        <CardContent className="px-5 py-4">
          <ul
            aria-label={t("histogram.title")}
            className="space-y-2.5"
            data-testid="cefr-histogram"
            data-histogram-total={total}
          >
            {rows.map((row) => {
              const width =
                total > 0 && row.count > 0
                  ? Math.max((row.count / total) * 100, 1)
                  : 0;
              return (
                <li key={row.key} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-[13px] font-bold text-muted-foreground">
                    {histogramLabel(row.key, t)}
                  </span>
                  <div
                    aria-hidden
                    className="h-4 flex-1 overflow-hidden rounded-[8px] bg-muted"
                  >
                    <div
                      className={`h-full rounded-[8px] ${
                        row.key === "untagged" || row.key === "other"
                          ? "bg-muted-foreground/50"
                          : "bg-primary"
                      }`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span
                    className="w-14 shrink-0 text-right text-[13px] font-bold tabular-nums"
                    data-testid="histogram-value"
                    data-bucket={row.key}
                  >
                    {row.count}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Bảng per-book — sort words desc (bookRowsDesc) */}
      <Card className="rounded-[18px]">
        <CardHeader className="px-5 pt-5 pb-0">
          <CardTitle className="font-display text-[17px] font-bold">
            {t("perBook.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 py-4">
          {books.length === 0 ? (
            <p className="text-[14px] font-semibold text-muted-foreground">
              {t("perBook.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]" data-testid="per-book-table">
                <caption className="sr-only">{t("perBook.title")}</caption>
                <thead>
                  <tr className="border-b-2 border-border text-left text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">
                    <th scope="col" className="px-3 py-2.5">
                      {t("perBook.book")}
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      {t("perBook.words")}
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      {t("perBook.audio")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {books.map((book) => (
                    <tr
                      key={book.bookId}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-3 py-2.5 font-bold">{book.title}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        {book.words}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        {formatPercent(book.withAudio, book.words)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Panel crawl/enrich — reuse crawlStatsDb (SF-1 gộp sẵn trong /stats);
          control KHÔNG làm lại — link sang crawl dashboard VU-32 */}
      <Card className="rounded-[18px]" data-testid="crawl-panel">
        <CardHeader className="px-5 pt-5 pb-0">
          <CardTitle className="font-display text-[17px] font-bold">
            {t("crawl.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-3 gap-4">
            {(
              [
                ["pending", stats.crawl.counts.pending],
                ["parsed", stats.crawl.counts.parsed],
                ["failed", stats.crawl.counts.failed],
              ] as const
            ).map(([key, value]) => (
              <div key={key}>
                <p
                  className={`font-display text-[22px] font-bold tabular-nums leading-none ${
                    key === "failed" && value > 0 ? "text-destructive" : ""
                  }`}
                  data-testid={`crawl-${key}`}
                >
                  {value}
                </p>
                <p className="mt-1 text-[12.5px] font-bold text-muted-foreground">
                  {t(`crawl.${key}`)}
                </p>
              </div>
            ))}
          </div>
          <Link
            href="/admin/vocabulary/crawl"
            className="inline-flex items-center rounded-[12px] px-3 py-1.5 text-[13px] font-bold text-primary transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            {t("crawl.link")} →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
