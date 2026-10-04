"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ApiError,
  callApi,
  jsonInit,
} from "@/lib/admin/crawl-client";
import {
  ENRICH_CHUNK,
  emptyCounts,
  runChunked,
  sumDryRunCounts,
} from "@/lib/admin/crawl-batch";
import type { DryRunCounts, EnrichReportItem } from "@/lib/oxford/enrich";

/**
 * Enrich panel per book (VU-32 SF-3, context pack §3) — "Điền dữ liệu thiếu
 * từ Oxford": dryRun preview counts → confirm → apply → report per-word.
 * Book >200 từ: page word ids qua GET /api/admin/vocabulary (limit 200/offset)
 * rồi POST enrich theo chunk wordIds — continue-and-collect qua runChunked
 * (chunk lỗi ghi report, KHÔNG dừng loop). API cap 200 từ/request — spec §[api].
 */

type Phase = "preview" | "confirm" | "running" | "report";

type ReportState = {
  items: EnrichReportItem[];
  failedChunks: number[];
  totalWords: number;
};

async function fetchBookWordIds(bookId: number): Promise<number[]> {
  const ids: number[] = [];
  let offset = 0;
  for (;;) {
    const page = await callApi<{
      items: { id: number }[];
      total: number;
    }>(`/api/admin/vocabulary?bookId=${bookId}&limit=200&offset=${offset}`);
    ids.push(...page.items.map((w) => w.id));
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) break;
  }
  return ids;
}

export function CrawlEnrichPanel({
  bookId,
  onDone,
}: {
  bookId: number;
  onDone: () => void;
}) {
  const t = useTranslations("admin.crawl");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("preview");
  const [scanning, setScanning] = useState(false);
  const [counts, setCounts] = useState<DryRunCounts | null>(null);
  const [wordIds, setWordIds] = useState<number[]>([]);
  const [processed, setProcessed] = useState(0);
  const [report, setReport] = useState<ReportState | null>(null);

  const errorText = (error: unknown) => {
    const code = error instanceof ApiError ? error.code : "generic";
    return t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic");
  };

  async function openPanel() {
    setOpen(true);
    setPhase("preview");
    setReport(null);
    setCounts(null);
    setScanning(true);
    try {
      const ids = await fetchBookWordIds(bookId);
      setWordIds(ids);
      if (ids.length === 0) {
        setCounts(emptyCounts());
        return;
      }
      const { results } = await runChunked(ids, ENRICH_CHUNK, (chunk) =>
        callApi<DryRunCounts>(
          "/api/admin/vocabulary/crawl/enrich",
          jsonInit("POST", { wordIds: chunk, dryRun: true }),
        ),
      );
      setCounts(sumDryRunCounts(results));
      setPhase("confirm");
    } catch (error) {
      toast.error(errorText(error));
      setOpen(false);
    } finally {
      setScanning(false);
    }
  }

  async function runApply(ids: number[]) {
    setPhase("running");
    setProcessed(0);
    try {
      const { results, failed } = await runChunked(
        ids,
        ENRICH_CHUNK,
        async (chunk, index) => {
          // apply mode → route wrap {ok, report: EnrichReportItem[]}
          const data = await callApi<{ report: EnrichReportItem[] }>(
            "/api/admin/vocabulary/crawl/enrich",
            jsonInit("POST", { wordIds: chunk }),
          );
          setProcessed(index + 1);
          return data.report;
        },
      );
      for (const failure of failed) {
        toast.warning(t("enrich.chunkFailed", { index: failure.index + 1 }));
      }
      setReport({
        items: results.flat(),
        failedChunks: failed.map((f) => f.index + 1),
        totalWords: ids.length,
      });
      setPhase("report");
      toast.success(t("enrich.done"));
      onDone();
    } catch (error) {
      toast.error(errorText(error));
      setPhase("report");
    }
  }

  const previewCards = counts
    ? [
        { key: "candidates", value: counts.candidates },
        { key: "fillableIpa", value: counts.fillableIpa },
        { key: "fillableExample", value: counts.fillableExample },
        { key: "fillableCefr", value: counts.fillableCefr },
        { key: "fillableAudio", value: counts.fillableAudio },
      ]
    : [];

  const totalChunks = Math.max(1, Math.ceil(wordIds.length / ENRICH_CHUNK));

  return (
    <>
      <Button
        variant="outline"
        className="rounded-[14px]"
        onClick={() => void openPanel()}
      >
        <Sparkles aria-hidden className="size-4" />
        {t("enrich.open")}
      </Button>

      {open ? (
        <div className="w-full rounded-[18px] border-2 border-border bg-card p-5">
          <p className="font-display text-[17px] font-bold">
            {t("enrich.title")}
          </p>

          {phase === "preview" && scanning ? (
            <p className="mt-3 flex items-center gap-2 text-[14px] font-semibold text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {t("enrich.scanning")}
            </p>
          ) : null}

          {phase === "preview" && !scanning && wordIds.length === 0 ? (
            <p className="mt-3 text-[14px] font-semibold text-muted-foreground">
              {t("enrich.empty")}
            </p>
          ) : null}

          {phase === "confirm" && counts && wordIds.length > 0 ? (
            <>
              <p className="mt-3 text-[13px] font-bold text-muted-foreground">
                {t("enrich.previewTitle")}
              </p>
              <dl className="mt-2 flex flex-wrap gap-2">
                {previewCards.map((c) => (
                  <div
                    key={c.key}
                    className="rounded-[12px] bg-muted/60 px-3 py-2"
                  >
                    <dt className="text-[12px] font-bold text-muted-foreground">
                      {t(`enrich.${c.key}`)}
                    </dt>
                    <dd
                      className="font-display text-[20px] font-bold tabular-nums"
                      data-count={c.key}
                    >
                      {c.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex gap-2">
                <Button
                  className="rounded-[14px]"
                  onClick={() => void runApply(wordIds)}
                >
                  {t("enrich.confirm", { count: wordIds.length })}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setOpen(false)}
                >
                  {tc("cancel")}
                </Button>
              </div>
            </>
          ) : null}

          {phase === "running" ? (
            <p className="mt-3 flex items-center gap-2 text-[14px] font-semibold text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {t("enrich.running", {
                done: processed,
                total: totalChunks,
              })}
            </p>
          ) : null}

          {phase === "report" && !report ? (
            // apply error giữa chừng — review B P2: không để panel trắng
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
            </div>
          ) : null}

          {phase === "report" && report ? (
            <div className="mt-3 space-y-3">
              <p className="text-[14px] font-bold">
                {t("enrich.reportSummary", {
                  filled: report.items.filter((i) => i.filled.length > 0).length,
                  skipped: report.items.filter((i) => i.filled.length === 0)
                    .length,
                  total: report.totalWords,
                })}
              </p>
              {report.failedChunks.length > 0 ? (
                <p className="text-[13px] font-semibold text-destructive">
                  {report.failedChunks
                    .map((i) => t("enrich.chunkFailed", { index: i }))
                    .join(" ")}
                </p>
              ) : null}
              <ul className="max-h-64 space-y-1 overflow-y-auto text-[13px]">
                {report.items.map((item, i) => (
                  <li
                    key={`${item.word}-${i}`}
                    className="flex flex-wrap items-baseline gap-2"
                  >
                    <span className="font-bold">{item.word}</span>
                    {item.filled.map((f) => (
                      <Badge key={f} variant="secondary">
                        {t(`enrich.field${f[0]!.toUpperCase()}${f.slice(1)}`)}
                      </Badge>
                    ))}
                    {item.skipped.map((f) => (
                      <Badge key={f} variant="outline">
                        {t(`enrich.field${f[0]!.toUpperCase()}${f.slice(1)}`)}{" "}
                        · {t("enrich.skipped")}
                      </Badge>
                    ))}
                    {item.reason !== undefined ? (
                      <span className="text-[12.5px] text-muted-foreground">
                        {item.reason === "noMatch"
                          ? t("enrich.reasonNoMatch")
                          : t("enrich.reasonNoAudioBlob")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {tc("cancel")}
                </Button>
              </div>
            </div>
          ) : null}

          <p className="mt-4 text-[12.5px] font-semibold text-muted-foreground">
            {t("attribution")}
          </p>
        </div>
      ) : null}
    </>
  );
}
