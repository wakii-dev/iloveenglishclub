"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ClipboardCopy, Globe, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  callApi,
  jsonInit,
  type CrawlStats,
} from "@/lib/admin/crawl-client";
import { formatCrawlTimestamp } from "@/lib/admin/crawl-batch";

/**
 * Crawl dashboard client (VU-32 SF-3, context pack §1-2) — stats GET
 * /api/admin/vocabulary/crawl/stats + controls POST /crawl/control
 * (retry-failed REAL; refresh-sitemap API fetch sitemap thật → có thể lỗi
 * 502 → toast). Hint lệnh runner copy-able — runner là script ngoài (API
 * KHÔNG chạy crawl — spec §[api]). Attribution nguồn bắt buộc hiển thị.
 */

const RUNNER_COMMANDS = ["cmdEnumerate", "cmdFetch", "cmdAudio"] as const;

export function CrawlDashboard() {
  const t = useTranslations("admin.crawl");
  const tc = useTranslations("admin.common");
  const [stats, setStats] = useState<CrawlStats | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<"refresh" | "retry" | null>(null);

  const loadStats = useCallback(async () => {
    setLoadError(false);
    try {
      const data = await callApi<CrawlStats>(
        "/api/admin/vocabulary/crawl/stats",
      );
      setStats(data);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const errorText = (error: unknown) => {
    const code = error instanceof ApiError ? error.code : "generic";
    return t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic");
  };

  async function runControl(action: "refresh-sitemap" | "retry-failed") {
    setBusy(action === "refresh-sitemap" ? "refresh" : "retry");
    try {
      const data = await callApi<Record<string, unknown>>(
        "/api/admin/vocabulary/crawl/control",
        jsonInit("POST", { action }),
      );
      if (action === "retry-failed") {
        toast.success(t("controls.retried", { count: Number(data.reset ?? 0) }));
      } else if (data.deltaTooLarge === true) {
        toast.warning(t("controls.deltaTooLarge", { delta: Number(data.delta ?? 0) }), {
          // hint SF-2 trả kèm (chạy runner enumerate) — chuỗi kỹ thuật, không i18n
          description: typeof data.hint === "string" ? data.hint : undefined,
        });
      } else {
        toast.success(
          t("controls.refreshed", { count: Number(data.inserted ?? 0) }),
        );
      }
      await loadStats();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function copyCommand(cmd: string) {
    try {
      await navigator.clipboard.writeText(cmd);
      toast.success(t("controls.copied"));
    } catch {
      toast.error(t("errors.generic"));
    }
  }

  if (stats === null) {
    return loadError ? (
      <Card className="rounded-[18px]">
        <CardContent className="flex flex-col items-start gap-3 px-5 py-5">
          <p className="text-[14px] font-semibold text-destructive">
            {t("errors.generic")}
          </p>
          <Button variant="outline" onClick={() => void loadStats()}>
            <RefreshCw aria-hidden className="size-4" />
            {tc("retry")}
          </Button>
        </CardContent>
      </Card>
    ) : (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="rounded-[18px]">
            <CardContent className="space-y-2 px-4 py-4">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    { key: "pending", value: stats.counts.pending, warn: false },
    { key: "parsed", value: stats.counts.parsed, warn: false },
    { key: "failed", value: stats.counts.failed, warn: stats.counts.failed > 0 },
    {
      key: "failedMaxAttempts",
      value: stats.counts.failedMaxAttempts,
      warn: stats.counts.failedMaxAttempts > 0,
    },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.key} className="rounded-[18px]">
            <CardContent className="px-4 py-4">
              <p
                className={`font-display text-[26px] font-bold tabular-nums leading-none ${
                  c.warn ? "text-destructive" : ""
                }`}
                data-count={c.key}
              >
                {c.value}
              </p>
              <p className="mt-1.5 text-[12.5px] font-bold text-muted-foreground">
                {t(`stats.${c.key}`)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="rounded-[14px]"
          disabled={busy !== null}
          onClick={() => void runControl("refresh-sitemap")}
        >
          <Globe aria-hidden className="size-4" />
          {busy === "refresh"
            ? t("controls.refreshing")
            : t("controls.refreshSitemap")}
        </Button>
        <Button
          variant="outline"
          className="rounded-[14px]"
          disabled={busy !== null}
          onClick={() => void runControl("retry-failed")}
        >
          <RotateCcw aria-hidden className="size-4" />
          {busy === "retry" ? t("controls.retrying") : t("controls.retryFailed")}
        </Button>
        <span className="text-[13px] font-bold text-muted-foreground tabular-nums">
          {t("stats.lastRun")}:{" "}
          {stats.lastRun === null
            ? t("stats.never")
            : formatCrawlTimestamp(stats.lastRun)}
        </span>
      </div>

      <Card className="rounded-[18px]">
        <CardHeader className="px-5 pt-5 pb-0">
          <CardTitle className="font-display text-[17px] font-bold">
            {t("stats.samples")}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 py-4">
          {stats.samples.length === 0 ? (
            <p className="text-[14px] font-semibold text-muted-foreground">
              {t("stats.samplesEmpty")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {stats.samples.map((s) => (
                <li
                  key={s.slug}
                  className="flex flex-wrap items-baseline gap-x-3 text-[13px]"
                >
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono font-bold">
                    {s.slug}
                  </code>
                  <span className="text-muted-foreground">
                    {s.lastError ?? t("stats.noError")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[18px]">
        <CardHeader className="px-5 pt-5 pb-0">
          <CardTitle className="font-display text-[17px] font-bold">
            {t("controls.runnerHint")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-5 py-4">
          {RUNNER_COMMANDS.map((key) => {
            // key nằm ở admin.crawl.controls.* (P1 review nhóm A — t(key) trụ
            // namespace hiện tại render literal "admin.crawl.cmdEnumerate")
            const cmd = t(`controls.${key}`);
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-[12px] bg-muted/60 px-3 py-2"
              >
                <code className="overflow-x-auto font-mono text-[13px] font-bold">
                  {cmd}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={cmd}
                  onClick={() => void copyCommand(cmd)}
                >
                  <ClipboardCopy aria-hidden className="size-4" />
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-[12.5px] font-semibold text-muted-foreground">
        {t("attribution")}
      </p>
    </div>
  );
}
