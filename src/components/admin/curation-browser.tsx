"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, callApi, jsonInit } from "@/lib/admin/crawl-client";
import { chunkIds } from "@/lib/admin/crawl-batch";
import { CEFR_LEVELS, MEANING_MAX } from "@/lib/admin/vocabulary";
import {
  BulkActionBar,
  useBulkSelection,
} from "@/components/admin/bulk-selection";

/**
 * CurationBrowser (VU-43 SF-3) — client duyệt crawl_entries (READ-ONLY lake):
 * filters status/q/cefr/pos/ox3000 + pagination server-side 50/page (63.9k
 * rows — KHÔNG fetch-all), multi-select qua tier-0 useBulkSelection, grid
 * soạn nghĩa VI (teacher-in-loop — no-LLM), promote chunk >200 aggregate,
 * audio backfill section scope bookId (dry-run → apply).
 *
 * API SF-1 (READ-ONLY cho SF này): GET /crawl/entries, POST /crawl/promote,
 * POST /audio-backfill. Error codes map vocabCmsCommon.errors (SF-1 skeleton).
 *
 * Test legs: repo không có DOM-test infra (vitest node) → pure helpers
 * (headwordOf/buildEntriesQuery/missingMeanings/aggregatePromoteReports/
 * promoteChunked/fetchEntries) export test fetch-mock trực tiếp; UI render
 * e2e thuộc spec admin-vocabulary-curation (pattern bulk-selection.test.ts).
 */

export const ENTRIES_PAGE_SIZE = 50;
/** Cap promote/request server (PROMOTE_CAP promote-store — pin spec §5; client
 * chunk tự động >200. Const copy client-side: promote-store import db — cấm
 * vào bundle client.) */
export const PROMOTE_CHUNK_CAP = 200;

export type CurationEntry = {
  id: number;
  slug: string;
  word: string | null;
  ipaUk: string | null;
  ipaUs: string | null;
  cefr: string | null;
  pos: string | null;
  ox3000: boolean;
  audioUkBlob: string | null;
  audioUsBlob: string | null;
  hasWord: boolean;
};

export type CurationBook = {
  id: number;
  label: string;
};

export type EntriesFilter = {
  status: string; // parsed (mặc định) | pending | failed
  q: string;
  cefr: string[]; // multi — csv cho API
  pos: string;
  ox3000: "all" | "only";
  offset: number;
};

export type PromoteReport = {
  created: number;
  duplicates: number;
  failed: { entryId: number; error: string }[];
};

/** COALESCE(word trim, pretty slug) — headword hiển thị (spec §2.2). */
export function headwordOf(entry: {
  word: string | null;
  slug: string;
}): string {
  const word = entry.word?.trim();
  if (word) return word;
  return prettySlugFallback(entry.slug);
}

/** Pretty slug client-side (mirror prettySlug server: strip _N + dash→space —
 * crawl-entries-store import db nên KHÔNG reuse từ client). */
export function prettySlugFallback(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/_\d+$/, "")
    .replace(/-/g, " ");
}

/** Querystring GET /crawl/entries — omit rỗng; cefr csv; ox3000 1/0. */
export function buildEntriesQuery(filter: EntriesFilter): string {
  const params = new URLSearchParams();
  params.set("status", filter.status || "parsed");
  params.set("limit", String(ENTRIES_PAGE_SIZE));
  params.set("offset", String(Math.max(0, filter.offset)));
  const q = filter.q.trim();
  if (q) params.set("q", q);
  const pos = filter.pos.trim();
  if (pos) params.set("pos", pos);
  if (filter.cefr.length > 0) params.set("cefr", filter.cefr.join(","));
  if (filter.ox3000 === "only") params.set("ox3000", "1");
  return params.toString();
}

export async function fetchEntries(
  filter: EntriesFilter,
): Promise<{ items: CurationEntry[]; total: number }> {
  const data = await callApi<{ items: CurationEntry[]; total: number }>(
    `/api/admin/vocabulary/crawl/entries?${buildEntriesQuery(filter)}`,
  );
  return { items: data.items ?? [], total: Number(data.total ?? 0) };
}

/** Đếm selected còn THIẾU nghĩa (trim rỗng = thiếu — route chặn meaningRequired). */
export function missingMeanings(
  entryIds: number[],
  meanings: Record<string, string>,
): number {
  return entryIds.filter((id) => !(meanings[String(id)] ?? "").trim()).length;
}

/** Aggregate report nhiều chunk — created/duplicates cộng dồn, failed nối. */
export function aggregatePromoteReports(
  reports: PromoteReport[],
): PromoteReport {
  return reports.reduce<PromoteReport>(
    (acc, r) => ({
      created: acc.created + r.created,
      duplicates: acc.duplicates + r.duplicates,
      failed: [...acc.failed, ...r.failed],
    }),
    { created: 0, duplicates: 0, failed: [] },
  );
}

/**
 * Promote chia chunk ≤ cap, chạy TUẦN TỰ rồi aggregate (không stop-mid: chunk
 * lỗi transport → mọi entry của chunk liệt vào failed error=code, chunk sau
 * vẫn chạy). Response shape SF-1: {ok, report:{created,duplicates,failed}}.
 * onChunkDone(done, total) — progress UI per chunk.
 */
export async function promoteChunked(
  entryIds: number[],
  bookId: number,
  meanings: Record<string, string>,
  options: {
    cap?: number;
    onChunkDone?: (done: number, total: number) => void;
  } = {},
): Promise<PromoteReport> {
  const chunks = chunkIds(entryIds, options.cap ?? PROMOTE_CHUNK_CAP);
  const reports: PromoteReport[] = [];
  let done = 0;
  for (const chunk of chunks) {
    const chunkMeanings = Object.fromEntries(
      chunk.map((id) => [String(id), meanings[String(id)] ?? ""]),
    );
    try {
      const data = await callApi<{ report: PromoteReport }>(
        "/api/admin/vocabulary/crawl/promote",
        jsonInit("POST", {
          entryIds: chunk,
          bookId,
          meanings: chunkMeanings,
        }),
      );
      reports.push(data.report);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "generic";
      reports.push({
        created: 0,
        duplicates: 0,
        failed: chunk.map((entryId) => ({ entryId, error: code })),
      });
    }
    done += 1;
    options.onChunkDone?.(done, chunks.length);
  }
  return aggregatePromoteReports(reports);
}

/** POST /audio-backfill dry-run — plan {matched[], pending, missing[]}. */
export async function fetchBackfillPlan(bookId: number): Promise<{
  matchedCount: number;
  pending: number;
  missingCount: number;
}> {
  const data = await callApi<{
    plan: { matched: unknown[]; pending: number; missing: unknown[] };
  }>(
    "/api/admin/vocabulary/audio-backfill",
    jsonInit("POST", { scope: { bookId }, dryRun: true }),
  );
  return {
    matchedCount: data.plan?.matched?.length ?? 0,
    pending: Number(data.plan?.pending ?? 0),
    missingCount: data.plan?.missing?.length ?? 0,
  };
}

/** POST /audio-backfill apply — report {applied, downloaded, errors}. */
export async function applyBackfill(
  bookId: number,
): Promise<{ applied: number; downloaded: number; errorCount: number }> {
  const data = await callApi<{
    report: { applied: number; downloaded: number; errors: unknown[] };
  }>(
    "/api/admin/vocabulary/audio-backfill",
    jsonInit("POST", { scope: { bookId }, dryRun: false, limit: 200 }),
  );
  return {
    applied: Number(data.report?.applied ?? 0),
    downloaded: Number(data.report?.downloaded ?? 0),
    errorCount: data.report?.errors?.length ?? 0,
  };
}

const STATUS_OPTIONS = ["parsed", "pending", "failed"] as const;
/** status → i18n key (union literal — chống dynamic key typing lệch). */
const STATUS_LABEL_KEYS = {
  parsed: "statusParsed",
  pending: "statusPending",
  failed: "statusFailed",
} as const;

export function CurationBrowser({ books }: { books: CurationBook[] }) {
  const t = useTranslations("vocabCuration");
  const te = useTranslations("vocabCmsCommon.errors");

  const [filter, setFilter] = useState<EntriesFilter>({
    status: "parsed",
    q: "",
    cefr: [],
    pos: "",
    ox3000: "all",
    offset: 0,
  });
  const [items, setItems] = useState<CurationEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);

  // entries đã thấy — selection giữ qua refetch (tier-0 Set id) nên grid cần
  // data entry của cả trang khác đã chọn trước đó
  const [entriesById, setEntriesById] = useState<Map<number, CurationEntry>>(
    () => new Map(),
  );

  const selection = useBulkSelection<CurationEntry>(
    items ?? [],
    (entry) => entry.id,
  );

  const [gridOpen, setGridOpen] = useState(false);
  const [meanings, setMeanings] = useState<Record<string, string>>({});

  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteBookId, setPromoteBookId] = useState("");
  const [promotePhase, setPromotePhase] = useState<
    "form" | "running" | "done"
  >("form");
  const [promoteProgress, setPromoteProgress] = useState({ done: 0, total: 0 });
  const [promoteReport, setPromoteReport] = useState<PromoteReport | null>(
    null,
  );

  const [backfillBookId, setBackfillBookId] = useState("");
  const [backfillPlan, setBackfillPlan] = useState<{
    matchedCount: number;
    pending: number;
    missingCount: number;
  } | null>(null);
  const [backfillBusy, setBackfillBusy] = useState<"plan" | "apply" | null>(
    null,
  );

  const loadEntries = useCallback(
    async (next: EntriesFilter) => {
      setBusy(true);
      setLoadError(false);
      try {
        const data = await fetchEntries(next);
        setItems(data.items);
        setTotal(data.total);
        setEntriesById((prev) => {
          const map = new Map(prev);
          for (const item of data.items) map.set(item.id, item);
          return map;
        });
      } catch {
        setLoadError(true);
        setItems([]);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadEntries(filter);
    // mount-only — filter đổi qua handler gọi loadEntries(tường minh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errorText = (error: unknown) => {
    const code = error instanceof ApiError ? error.code : "generic";
    return te.has(code) ? te(code) : te("generic");
  };

  const patchFilter = (patch: Partial<EntriesFilter>) => {
    const next = { ...filter, ...patch, offset: patch.offset ?? 0 };
    setFilter(next);
    void loadEntries(next);
  };

  const selectedEntries = useMemo(() => {
    const list: CurationEntry[] = [];
    for (const id of selection.selectedIds) {
      const entry = entriesById.get(Number(id));
      if (entry) list.push(entry);
    }
    return list;
  }, [selection.selectedIds, entriesById]);

  const selectedIds = useMemo(
    () => selectedEntries.map((entry) => entry.id),
    [selectedEntries],
  );
  const missing = missingMeanings(selectedIds, meanings);

  function toggleCefr(level: string) {
    patchFilter({
      cefr: filter.cefr.includes(level)
        ? filter.cefr.filter((c) => c !== level)
        : [...filter.cefr, level],
    });
  }

  function resetFilters() {
    patchFilter({
      status: "parsed",
      q: "",
      cefr: [],
      pos: "",
      ox3000: "all",
      offset: 0,
    });
  }

  const page = Math.floor(filter.offset / ENTRIES_PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / ENTRIES_PAGE_SIZE));

  async function runPromote() {
    const bookId = Number(promoteBookId);
    if (!bookId) return;
    setPromotePhase("running");
    setPromoteProgress({ done: 0, total: chunkIds(selectedIds, PROMOTE_CHUNK_CAP).length });
    const report = await promoteChunked(selectedIds, bookId, meanings, {
      onChunkDone: (done, total) => setPromoteProgress({ done, total }),
    });
    setPromoteReport(report);
    setPromotePhase("done");
    // toast: created>0 → success; toàn duplicates → vẫn thành công (batch
    // không chết — created=0 toast success với created=0); failed → error
    if (report.failed.length > 0) {
      toast.error(
        `${t("promote.created", { count: report.created })} · ${t("promote.failed", { count: report.failed.length })}`,
      );
    } else if (report.created > 0) {
      toast.success(t("promote.successCreated", { count: report.created }));
      if (report.duplicates > 0) {
        toast.info(t("promote.duplicates", { count: report.duplicates }));
      }
    } else {
      toast.success(
        t("promote.successDuplicatesOnly", { count: report.duplicates }),
      );
    }
    await loadEntries(filter); // badge hasWord cập nhật
  }

  async function runBackfillDryRun() {
    const bookId = Number(backfillBookId);
    if (!bookId) {
      toast.error(te("scopeRequired"));
      return;
    }
    setBackfillBusy("plan");
    try {
      const plan = await fetchBackfillPlan(bookId);
      setBackfillPlan(plan);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBackfillBusy(null);
    }
  }

  async function runBackfillApply() {
    const bookId = Number(backfillBookId);
    if (!bookId) {
      toast.error(te("scopeRequired"));
      return;
    }
    setBackfillBusy("apply");
    try {
      const report = await applyBackfill(bookId);
      if (report.errorCount > 0) {
        toast.warning(
          `${t("backfill.reportApplied", { count: report.applied })}${t("backfill.reportErrors", { count: report.errorCount })}`,
        );
      } else {
        toast.success(
          t("backfill.reportApplied", { count: report.applied }),
        );
      }
      setBackfillPlan(null); // force dry-run lại trước apply kế (marker tự nhiên)
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBackfillBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filter bar — form submit (Enter) hoặc đổi control refetch ngay */}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          patchFilter({});
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="curation-search">{t("filters.search")}</Label>
          <Input
            id="curation-search"
            name="q"
            placeholder={t("filters.searchPlaceholder")}
            value={filter.q}
            onChange={(event) =>
              setFilter((prev) => ({ ...prev, q: event.target.value }))
            }
            className="w-64"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="curation-status">{t("filters.status")}</Label>
          <Select
            value={filter.status}
            onValueChange={(value) => patchFilter({ status: value })}
          >
            <SelectTrigger id="curation-status" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`filters.${STATUS_LABEL_KEYS[status]}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="curation-pos">{t("filters.pos")}</Label>
          <Input
            id="curation-pos"
            name="pos"
            placeholder={t("filters.posPlaceholder")}
            value={filter.pos}
            onChange={(event) =>
              setFilter((prev) => ({ ...prev, pos: event.target.value }))
            }
            className="w-32"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="curation-ox3000">{t("filters.ox3000")}</Label>
          <Select
            value={filter.ox3000}
            onValueChange={(value) => patchFilter({ ox3000: value as "all" | "only" })}
          >
            <SelectTrigger id="curation-ox3000" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.ox3000All")}</SelectItem>
              <SelectItem value="only">{t("filters.ox3000Only")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" variant="outline" className="rounded-[14px]">
          {t("filters.apply")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="rounded-[14px]"
          onClick={resetFilters}
        >
          {t("filters.reset")}
        </Button>
      </form>

      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label={t("filters.cefr")}
      >
        {CEFR_LEVELS.map((level) => {
          const active = filter.cefr.includes(level);
          return (
            <Button
              key={level}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              onClick={() => toggleCefr(level)}
              className="rounded-full tabular-nums"
            >
              {level}
            </Button>
          );
        })}
      </div>

      {/* Bảng entries */}
      <Card className="rounded-[18px]">
        <CardContent className="px-0 py-0">
          {items === null ? (
            <div className="space-y-2 px-5 py-5" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="px-5 py-8 text-center text-[14px] font-semibold text-muted-foreground">
              {total === 0 && !loadError && filter.status === "parsed" && !filter.q && filter.cefr.length === 0 && !filter.pos && filter.ox3000 === "all"
                ? t("pagination.empty")
                : t("pagination.emptyFiltered")}
            </p>
          ) : (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b-2 border-border text-left text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={t("table.selectPage")}
                      checked={
                        items.length > 0 &&
                        items.every((entry) => selection.isSelected(entry.id))
                      }
                      onChange={() => selection.togglePage()}
                      className="size-4 accent-primary"
                    />
                  </th>
                  <th className="px-4 py-3">{t("table.colHeadword")}</th>
                  <th className="px-4 py-3">{t("table.colIpa")}</th>
                  <th className="px-4 py-3">{t("table.colCefr")}</th>
                  <th className="px-4 py-3">{t("table.colPos")}</th>
                  <th className="px-4 py-3">{t("table.colAudio")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => {
                  const headword = headwordOf(entry);
                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-border/60 last:border-0"
                      data-entry-id={entry.id}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={t("table.selectEntry", { headword })}
                          checked={selection.isSelected(entry.id)}
                          onChange={() => selection.toggle(entry)}
                          className="size-4 accent-primary"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold" data-testid="headword">
                            {headword}
                          </span>
                          {entry.ox3000 ? (
                            <Badge variant="secondary">{t("table.ox3000")}</Badge>
                          ) : null}
                          {entry.hasWord ? (
                            <Link
                              href={`/admin/vocabulary?q=${encodeURIComponent(headword)}`}
                              title={t("table.hasWordHint")}
                              data-testid="has-word-badge"
                            >
                              <Badge variant="outline" className="hover:bg-accent">
                                {t("table.hasWord")}
                              </Badge>
                            </Link>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] text-muted-foreground">
                        {entry.ipaUk ?? "—"}
                        {entry.ipaUs && entry.ipaUs !== entry.ipaUk
                          ? ` / ${entry.ipaUs}`
                          : ""}
                      </td>
                      <td className="px-4 py-3">
                        {entry.cefr ? (
                          <Badge variant="secondary" className="tabular-nums">
                            {entry.cefr}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {entry.pos ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {entry.audioUkBlob || entry.audioUsBlob ? (
                          <span
                            title={t("table.hasAudio")}
                            aria-label={t("table.hasAudio")}
                          >
                            <Volume2 aria-hidden className="size-4 text-primary" />
                          </span>
                        ) : (
                          <span title={t("table.noAudio")} aria-label={t("table.noAudio")}>
                            <VolumeX aria-hidden className="size-4 text-muted-foreground" />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {loadError ? (
        <p className="text-[14px] font-semibold text-destructive">
          {te("generic")}
        </p>
      ) : null}

      {/* Pagination server-side */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-bold text-muted-foreground tabular-nums">
          {t("pagination.total", { total })}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={filter.offset === 0 || busy}
            onClick={() => patchFilter({ offset: filter.offset - ENTRIES_PAGE_SIZE })}
          >
            {t("pagination.prev")}
          </Button>
          <span className="text-[13px] font-bold tabular-nums">
            {t("pagination.pageOf", { page, pages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages || busy}
            onClick={() => patchFilter({ offset: filter.offset + ENTRIES_PAGE_SIZE })}
          >
            {t("pagination.next")}
          </Button>
        </div>
      </div>

      {/* Grid soạn nghĩa VI — mở từ bulk bar (teacher-in-loop, no-LLM) */}
      {gridOpen && selectedEntries.length > 0 ? (
        <Card className="rounded-[18px]">
          <CardHeader className="px-5 pt-5 pb-0">
            <CardTitle className="font-display text-[17px] font-bold">
              {t("grid.title", { count: selectedEntries.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-5 py-4">
            {selectedEntries.map((entry) => {
              const headword = headwordOf(entry);
              const inputId = `curation-meaning-${entry.id}`;
              return (
                <div key={entry.id} className="grid gap-1.5">
                  <Label htmlFor={inputId}>{t("grid.meaningLabel", { headword })}</Label>
                  <Input
                    id={inputId}
                    value={meanings[String(entry.id)] ?? ""}
                    maxLength={MEANING_MAX}
                    placeholder={t("grid.meaningPlaceholder")}
                    onChange={(event) =>
                      setMeanings((prev) => ({
                        ...prev,
                        [String(entry.id)]: event.target.value,
                      }))
                    }
                  />
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <p
                className={`text-[13px] font-bold ${missing > 0 ? "text-destructive" : "text-primary"}`}
                data-testid="meaning-missing-count"
              >
                {missing > 0
                  ? t("grid.missing", { count: missing })
                  : t("grid.allFilled")}
              </p>
              <Button
                type="button"
                className="rounded-[14px]"
                disabled={missing > 0}
                onClick={() => {
                  setPromotePhase("form");
                  setPromoteReport(null);
                  setPromoteOpen(true);
                }}
                data-testid="promote-open"
              >
                {t("promote.open")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMeanings({});
                  setGridOpen(false);
                }}
              >
                {t("grid.clear")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <BulkActionBar
        count={selection.count}
        onClear={() => {
          selection.clear();
          setGridOpen(false);
        }}
      >
        <Button
          type="button"
          size="sm"
          className="rounded-[14px]"
          onClick={() => setGridOpen((open) => !open)}
        >
          {t("grid.open")}
        </Button>
      </BulkActionBar>

      {/* Dialog promote — Radix focus-trap + Esc chuẩn a11y */}
      <Dialog
        open={promoteOpen}
        onOpenChange={(open) => {
          if (promotePhase !== "running") setPromoteOpen(open);
        }}
      >
        <DialogContent className="rounded-[12px] sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[17px] font-bold">
              {t("promote.title", { count: selectedIds.length })}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              {t("promote.bookRequired")}
            </DialogDescription>
          </DialogHeader>

          {promotePhase === "done" && promoteReport ? (
            <div className="space-y-2 rounded-[12px] bg-muted/60 p-3 text-[13px]" data-testid="promote-report">
              <p className="font-display font-bold">{t("promote.reportTitle")}</p>
              <p>{t("promote.created", { count: promoteReport.created })}</p>
              <p>{t("promote.duplicates", { count: promoteReport.duplicates })}</p>
              <p>{t("promote.failed", { count: promoteReport.failed.length })}</p>
              {promoteReport.failed.length > 0 ? (
                <ul className="space-y-0.5 text-destructive">
                  {promoteReport.failed.map((f) => (
                    <li key={f.entryId}>
                      {t("promote.failedItem", {
                        id: f.entryId,
                        error: te.has(f.error) ? te(f.error) : te("generic"),
                      })}
                    </li>
                  ))}
                </ul>
              ) : null}
              {promoteReport.duplicates > 0 ? (
                <p className="text-muted-foreground">{t("promote.mergeHint")}</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="promote-book">{t("promote.book")}</Label>
                <Select
                  value={promoteBookId}
                  onValueChange={setPromoteBookId}
                  disabled={promotePhase === "running"}
                >
                  <SelectTrigger id="promote-book" className="w-full">
                    <SelectValue placeholder={t("promote.bookPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {books.map((book) => (
                      <SelectItem key={book.id} value={String(book.id)}>
                        {book.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {promotePhase === "running" ? (
                <p
                  className="flex items-center gap-2 text-[13px] font-bold"
                  aria-live="polite"
                  data-testid="promote-progress"
                >
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  {promoteProgress.total > 1
                    ? t("promote.chunkProgress", {
                        done: promoteProgress.done,
                        total: promoteProgress.total,
                      })
                    : t("promote.running")}
                </p>
              ) : null}
            </div>
          )}

          <DialogFooter className="gap-2">
            {promotePhase === "done" ? (
              <Button
                onClick={() => setPromoteOpen(false)}
                className="rounded-[14px]"
              >
                {t("promote.close")}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  disabled={promotePhase === "running"}
                  onClick={() => setPromoteOpen(false)}
                >
                  {t("promote.cancel")}
                </Button>
                <Button
                  onClick={() => void runPromote()}
                  disabled={promotePhase === "running" || !promoteBookId}
                  data-testid="promote-confirm"
                >
                  {promotePhase === "running" ? t("promote.running") : t("promote.confirm")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audio backfill — section cuối trang, scope bookId bắt buộc */}
      <Card className="rounded-[18px]">
        <CardHeader className="px-5 pt-5 pb-0">
          <CardTitle className="font-display text-[17px] font-bold">
            {t("backfill.title")}
          </CardTitle>
          <p className="text-[13px] font-semibold text-muted-foreground">
            {t("backfill.lead")}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="backfill-book">{t("backfill.book")}</Label>
              <Select value={backfillBookId} onValueChange={setBackfillBookId}>
                <SelectTrigger id="backfill-book" className="w-64">
                  <SelectValue placeholder={t("backfill.bookPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {books.map((book) => (
                    <SelectItem key={book.id} value={String(book.id)}>
                      {book.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              className="rounded-[14px]"
              disabled={backfillBusy !== null}
              onClick={() => void runBackfillDryRun()}
              data-testid="backfill-dry-run"
            >
              {backfillBusy === "plan" ? (
                <>
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  {t("backfill.dryRunning")}
                </>
              ) : (
                t("backfill.dryRun")
              )}
            </Button>
            <Button
              className="rounded-[14px]"
              disabled={backfillBusy !== null}
              onClick={() => void runBackfillApply()}
              data-testid="backfill-apply"
            >
              {backfillBusy === "apply" ? (
                <>
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  {t("backfill.applying")}
                </>
              ) : (
                t("backfill.apply")
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("filters.reset")}
              disabled={busy}
              onClick={() => void loadEntries(filter)}
            >
              <RefreshCw aria-hidden className="size-4" />
            </Button>
          </div>

          {backfillPlan ? (
            <div className="space-y-1.5 rounded-[12px] bg-muted/60 p-3 text-[13px]" data-testid="backfill-plan">
              <p className="font-display font-bold">{t("backfill.planTitle")}</p>
              <p className="tabular-nums">
                {t("backfill.matched", { count: backfillPlan.matchedCount })}
              </p>
              <p className="tabular-nums">
                {t("backfill.pending", { count: backfillPlan.pending })}
              </p>
              <p className="tabular-nums">
                {t("backfill.missing", { count: backfillPlan.missingCount })}
              </p>
              {backfillPlan.matchedCount === 0 ? (
                <p className="text-muted-foreground">{t("backfill.noneMatched")}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
