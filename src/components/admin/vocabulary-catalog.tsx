"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ImageOff,
  Pencil,
  Plus,
  Search,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  BulkActionBar,
  ConfirmDialog,
  useBulkSelection,
} from "@/components/admin/bulk-selection";
import { chunkIds } from "@/lib/admin/crawl-batch";
import { MAX_AUDIO_BYTES, mimeToAudioExt } from "@/lib/admin/audio-mapping";
import {
  CEFR_LEVELS,
  type CefrLevel,
  resolveStoredAudioUrl,
} from "@/lib/admin/vocabulary";

/**
 * Catalog TOÀN CỤC /admin/vocabulary (VU-43 SF-2 t2-t10) — client REST
 * pagination 50/page (cùng pattern VocabularyManager/CrawlDashboard), filter
 * bar (search word+meaning, chips CEFR, nguồn, audio, book, orphan, sort),
 * bulk select (primitives tier-0 SF-1 — KHÔNG sửa file đó), bulk gán sách /
 * tag CEFR (OVERWRITE) / xoá 2-phase (dry-run progressAffected), export CSV
 * giữ filter, dialog thêm/sửa từ (audio + image upload, preview thumb).
 * Pure legs export để vitest node test (không DOM) — UI render là e2e.
 */

export const CATALOG_PAGE_SIZE = 50;
/** Cap bulk per-request (spec §5.1) — client chunk + aggregate report. */
export const CATALOG_BULK_CHUNK = 500;

export type CatalogBook = { id: number; slug: string; title: string };

export type CatalogWord = {
  id: number;
  word: string;
  ipa: string | null;
  meaning_vi: string;
  example: string | null;
  audio_url: string | null;
  cefr: string | null;
  source: string | null;
  pos: string | null;
  image_url: string | null;
  synonyms: string | null;
  bookIds: number[];
};

export type CatalogSort = "created" | "word" | "cefr";

export type CatalogFilters = {
  q: string;
  cefr: CefrLevel[];
  source: "" | "oxford-ld" | "teacher";
  audio: "" | "has" | "missing";
  bookId: number | null;
  orphan: boolean; // WIN khi conflict bookId — bookId bị bỏ (spec §4)
  sort: CatalogSort;
};

export const DEFAULT_FILTERS: CatalogFilters = {
  q: "",
  cefr: [],
  source: "",
  audio: "",
  bookId: null,
  orphan: false,
  sort: "created",
};

// ---------------------------------------------------------------------------
// Pure legs (vitest node — component chỉ wrap quanh)
// ---------------------------------------------------------------------------

/** Chips CEFR multi-select — toggle 1 cấp, giữ thứ tự A1→C2. */
export function toggleCefrFilter(
  levels: CefrLevel[],
  level: CefrLevel,
): CefrLevel[] {
  return levels.includes(level)
    ? levels.filter((l) => l !== level)
    : [...levels, level].sort();
}

/** Filter+page → query params GET list. orphan=1 WIN — bookId không set kèm. */
export function buildCatalogParams(
  f: CatalogFilters,
  page: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.cefr.length > 0) params.set("cefr", f.cefr.join(","));
  if (f.source) params.set("source", f.source);
  if (f.audio) params.set("audio", f.audio);
  if (f.orphan) params.set("orphan", "1");
  else if (f.bookId !== null) params.set("bookId", String(f.bookId));
  params.set("sort", f.sort);
  params.set("limit", String(CATALOG_PAGE_SIZE));
  params.set("offset", String(page * CATALOG_PAGE_SIZE));
  return params;
}

export function totalPagesFor(total: number): number {
  return Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
}

export type AssignBooksReport = {
  affected: number;
  skipped: number;
  errors: { wordId?: number; bookId?: number; error: string }[];
};

export function aggregateAssignReports(
  reports: AssignBooksReport[],
): AssignBooksReport {
  return {
    affected: reports.reduce((sum, r) => sum + r.affected, 0),
    skipped: reports.reduce((sum, r) => sum + r.skipped, 0),
    errors: reports.flatMap((r) => r.errors),
  };
}

export type TagCefrReport = {
  affected: number;
  errors: { wordId?: number; error: string }[];
};

export function aggregateTagReports(reports: TagCefrReport[]): TagCefrReport {
  return {
    affected: reports.reduce((sum, r) => sum + r.affected, 0),
    errors: reports.flatMap((r) => r.errors),
  };
}

export type DeleteDryRunReport = {
  willDelete: number;
  progressAffected: number;
  missing: number[];
};

export function aggregateDeleteDryRuns(
  reports: DeleteDryRunReport[],
): DeleteDryRunReport {
  return {
    willDelete: reports.reduce((sum, r) => sum + r.willDelete, 0),
    progressAffected: reports.reduce((sum, r) => sum + r.progressAffected, 0),
    missing: reports.flatMap((r) => r.missing),
  };
}

export type DeleteApplyReport = {
  affected: number;
  progressAffected: number;
  errors: { wordId?: number; error: string }[];
};

export function aggregateDeleteApplies(
  reports: DeleteApplyReport[],
): DeleteApplyReport {
  return {
    affected: reports.reduce((sum, r) => sum + r.affected, 0),
    progressAffected: reports.reduce((sum, r) => sum + r.progressAffected, 0),
    errors: reports.flatMap((r) => r.errors),
  };
}

/** Filename từ Content-Disposition (e2e pin pattern vocabulary-YYYY-MM-DD.csv). */
export function parseExportFilename(disposition: string | null): string | null {
  const match = /filename="([^"]+)"/.exec(disposition ?? "");
  return match ? (match[1] ?? null) : null;
}

export class CatalogApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/**
 * P1 review SF-2 round 1: storage FS-driver (local dev KHÔNG có BLOB token)
 * trả url TƯƠNG ĐỐI (`/images/words/…` — storage-server.ts:44) trong khi PATCH
 * validateImageUrlInput chỉ nhận http(s) TUYỆT ĐỐI → absolutize trước khi set
 * state/lưu (blob driver đã tuyệt đối — passthrough). origin truyền vào để
 * pure (unit test không đụng window).
 */
export function absolutizeStorageUrl(
  url: string | null | undefined,
  origin: string,
): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  try {
    return new URL(url, origin).toString();
  } catch {
    return url;
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** GET list 1 trang — throw CatalogApiError(error code | "network"). */
export async function fetchCatalogPage(
  params: string,
  signal?: AbortSignal,
): Promise<{ items: CatalogWord[]; total: number }> {
  let res: Response;
  try {
    res = await fetch(`/api/admin/vocabulary?${params}`, { signal });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new CatalogApiError("network");
  }
  const body = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!res.ok || body?.ok !== true) {
    throw new CatalogApiError(
      typeof body?.error === "string" ? body.error : "generic",
    );
  }
  return {
    items: (body.items ?? []) as CatalogWord[],
    total: typeof body.total === "number" ? body.total : 0,
  };
}

async function requestJson<T>(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CatalogApiError("network");
  }
  const parsed = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!res.ok || parsed?.ok === false) {
    throw new CatalogApiError(
      typeof parsed?.error === "string" ? parsed.error : "generic",
    );
  }
  return parsed as T;
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return requestJson(url, "POST", body);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VocabularyCatalog({ books }: { books: CatalogBook[] }) {
  const t = useTranslations("vocabCatalog");
  const terr = useTranslations("vocabCmsCommon.errors");
  const te = useTranslations("admin.errors");
  const tc = useTranslations("admin.common");
  // audio pre-check messages — dùng chung key VocabularyManager (admin.json
  // chỉ ĐỌC, không sửa — boundary SF-2)
  const tv = useTranslations("admin.vocabulary");

  const errorText = useCallback(
    (code: string) => (terr.has(code) ? terr(code) : te("generic")),
    [terr, te],
  );
  const codeOf = (error: unknown) =>
    error instanceof CatalogApiError ? error.code : "generic";

  // --- list state ---
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);
  const [qInput, setQInput] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ items: CatalogWord[]; total: number } | null>(
    null,
  );
  const [loadError, setLoadError] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const refetch = useCallback(() => setReloadTick((tick) => tick + 1), []);

  // Search debounce 300ms — commit input vào filters + reset trang.
  useEffect(() => {
    const id = setTimeout(() => {
      const q = qInput.trim();
      setFilters((prev) => (prev.q === q ? prev : { ...prev, q }));
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [qInput]);

  const listParams = useMemo(
    () => buildCatalogParams(filters, page).toString(),
    [filters, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchCatalogPage(listParams, controller.signal)
      .then((result) => {
        setData(result);
        setLoadError(false);
      })
      .catch((error) => {
        if (!isAbort(error)) setLoadError(true);
      });
    return () => controller.abort();
  }, [listParams, reloadTick]);

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = totalPagesFor(total);

  // --- bulk selection (primitives tier-0) ---
  const selection = useBulkSelection(rows, (row) => row.id);
  const selectedWordIds = useMemo(
    () => [...selection.selectedIds].map((id) => Number(id)),
    [selection.selectedIds],
  );

  // --- audio playback (pattern VocabularyManager) ---
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  useEffect(
    () => () => audioRef.current?.pause(),
    [],
  );
  function togglePlay(row: CatalogWord) {
    if (!row.audio_url) return;
    if (playingId === row.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(resolveStoredAudioUrl(row.audio_url));
    audioRef.current = audio;
    audio.onended = () => setPlayingId((cur) => (cur === row.id ? null : cur));
    audio
      .play()
      .then(() => setPlayingId(row.id))
      .catch(() => toast.error(errorText("generic")));
  }

  // --- export (giữ filter hiện tại) ---
  const [exporting, setExporting] = useState(false);
  async function runExport() {
    setExporting(true);
    try {
      const params = buildCatalogParams(filters, 0);
      params.delete("limit");
      params.delete("offset");
      const res = await fetch(`/api/admin/vocabulary/export?${params}`);
      const disposition = res.headers.get("content-disposition");
      if (!res.ok || !disposition) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(
          t("report.exportFail", {
            error: errorText(body?.error ?? "generic"),
          }),
        );
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = parseExportFilename(disposition) ?? "vocabulary.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(errorText("generic"));
    } finally {
      setExporting(false);
    }
  }

  // --- bulk gán sách ---
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignBookIds, setAssignBookIds] = useState<number[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  async function runAssignBooks() {
    if (assignBookIds.length === 0) {
      toast.error(t("toast.selectBooks"));
      return;
    }
    setBulkBusy(true);
    const reports: AssignBooksReport[] = [];
    try {
      for (const chunk of chunkIds(selectedWordIds, CATALOG_BULK_CHUNK)) {
        const result = await postJson<{ report: AssignBooksReport }>(
          "/api/admin/vocabulary/bulk",
          {
            action: "assign-books",
            wordIds: chunk,
            bookIds: assignBookIds,
          },
        );
        reports.push(result.report);
      }
    } catch (error) {
      // P2 review r1: lỗi giữa các chunk — chunk ĐÃ áp vẫn báo cáo (không mất
      // partial-success); re-run an toàn (assign onConflictDoNothing = skip)
      const applied = aggregateAssignReports(reports);
      if (reports.length > 0) {
        console.error(
          "[vocabulary-catalog] assign-books partial trước lỗi:",
          applied,
          error,
        );
        toast.success(
          t("report.assigned", {
            affected: applied.affected,
            skipped: applied.skipped,
          }),
        );
      }
      toast.error(errorText(codeOf(error)));
      // P1 review r2: nhánh lỗi phải nhả busy — kẹt true = mọi nút submit
      // disabled vĩnh viễn (compensation re-run không chạy được)
      setBulkBusy(false);
      selection.clear();
      await refetch();
      return;
    }
    const agg = aggregateAssignReports(reports);
    if (agg.errors.length > 0) {
      console.error("[vocabulary-catalog] assign-books errors:", agg.errors);
      toast.error(t("report.errors", { count: agg.errors.length }));
    }
    toast.success(
      t("report.assigned", { affected: agg.affected, skipped: agg.skipped }),
    );
    setAssignOpen(false);
    setAssignBookIds([]);
    selection.clear();
    await refetch();
    setBulkBusy(false);
  }

  // --- bulk tag CEFR (OVERWRITE) ---
  const [tagOpen, setTagOpen] = useState(false);
  const [tagLevel, setTagLevel] = useState<CefrLevel | "">("");

  async function runTagCefr() {
    if (!tagLevel) {
      toast.error(t("toast.selectCefr"));
      return;
    }
    setBulkBusy(true);
    const reports: TagCefrReport[] = [];
    try {
      for (const chunk of chunkIds(selectedWordIds, CATALOG_BULK_CHUNK)) {
        const result = await postJson<{ report: TagCefrReport }>(
          "/api/admin/vocabulary/bulk",
          { action: "tag-cefr", wordIds: chunk, cefr: tagLevel },
        );
        reports.push(result.report);
      }
    } catch (error) {
      // P2 review r1 — partial-success + idempotent re-run (OVERWRITE lặp an toàn)
      const applied = aggregateTagReports(reports);
      if (reports.length > 0) {
        console.error(
          "[vocabulary-catalog] tag-cefr partial trước lỗi:",
          applied,
          error,
        );
        toast.success(t("report.tagged", { affected: applied.affected }));
      }
      toast.error(errorText(codeOf(error)));
      // P1 review r2: nhả busy trên nhánh lỗi (như assign-books)
      setBulkBusy(false);
      selection.clear();
      await refetch();
      return;
    }
    const agg = aggregateTagReports(reports);
    if (agg.errors.length > 0) {
      console.error("[vocabulary-catalog] tag-cefr errors:", agg.errors);
      toast.error(t("report.errors", { count: agg.errors.length }));
    }
    toast.success(t("report.tagged", { affected: agg.affected }));
    setTagOpen(false);
    setTagLevel("");
    selection.clear();
    await refetch();
    setBulkBusy(false);
  }

  // --- bulk xoá 2-phase: dry-run đếm progress TRƯỚC, confirm rồi apply ---
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [deletePlan, setDeletePlan] = useState<DeleteDryRunReport | null>(null);
  // P2 review r1: chụp ids VỚI plan — teacher đổi selection trong lúc dry-run
  // chạy không làm lệch số preview ≠ số xoá thật
  const [deleteIds, setDeleteIds] = useState<number[]>([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  async function prepareDelete() {
    setDeleteChecking(true);
    const ids = selectedWordIds;
    setDeleteIds(ids);
    const reports: DeleteDryRunReport[] = [];
    try {
      for (const chunk of chunkIds(ids, CATALOG_BULK_CHUNK)) {
        const result = await postJson<{ report: DeleteDryRunReport }>(
          "/api/admin/vocabulary/bulk",
          { action: "delete", wordIds: chunk, dryRun: true },
        );
        reports.push(result.report);
      }
      setDeletePlan(aggregateDeleteDryRuns(reports));
      setConfirmDeleteOpen(true);
    } catch (error) {
      toast.error(errorText(codeOf(error)));
    } finally {
      setDeleteChecking(false);
    }
  }

  async function applyDelete() {
    if (!deletePlan) return;
    setBulkBusy(true);
    const reports: DeleteApplyReport[] = [];
    try {
      for (const chunk of chunkIds(deleteIds, CATALOG_BULK_CHUNK)) {
        const result = await postJson<{ report: DeleteApplyReport }>(
          "/api/admin/vocabulary/bulk",
          { action: "delete", wordIds: chunk },
        );
        reports.push(result.report);
      }
    } catch (error) {
      // P2 review r1 — partial-success: từ đã xoá mất rồi (không hoàn tác),
      // báo rõ số đã áp; re-run dry-run lại là an toàn
      const applied = aggregateDeleteApplies(reports);
      if (reports.length > 0) {
        console.error(
          "[vocabulary-catalog] delete partial trước lỗi:",
          applied,
          error,
        );
        toast.success(
          t("report.deleted", {
            affected: applied.affected,
            progressAffected: applied.progressAffected,
          }),
        );
      }
      toast.error(errorText(codeOf(error)));
      // P1 review r2: nhả busy trên nhánh lỗi (như assign-books)
      setBulkBusy(false);
      setDeletePlan(null);
      selection.clear();
      await refetch();
      return;
    }
    const agg = aggregateDeleteApplies(reports);
    if (agg.errors.length > 0) {
      console.error("[vocabulary-catalog] delete errors:", agg.errors);
      toast.error(t("report.errors", { count: agg.errors.length }));
    }
    toast.success(
      t("report.deleted", {
        affected: agg.affected,
        progressAffected: agg.progressAffected,
      }),
    );
    setDeletePlan(null);
    selection.clear();
    await refetch();
    setBulkBusy(false);
  }

  // --- dialog thêm từ ---
  const [adding, setAdding] = useState(false);
  const [addCefr, setAddCefr] = useState<CefrLevel | "">("");
  // P2 review r1 (spec §2.1: image optional cả lúc tạo) — word chưa có id →
  // route /image đặt path tmp-{ts}.{ext}, PATCH-less: url gửi thẳng POST create
  const [addImageUrl, setAddImageUrl] = useState<string | null>(null);
  const [uploadingAddImage, setUploadingAddImage] = useState(false);

  async function uploadAddImage(file: File) {
    setUploadingAddImage(true);
    try {
      const form = new FormData();
      form.append("file", file);
      let res: Response;
      try {
        res = await fetch("/api/admin/vocabulary/image", {
          method: "POST",
          body: form,
        });
      } catch {
        throw new CatalogApiError("network");
      }
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        url?: string;
      } | null;
      if (!res.ok || body?.ok !== true) {
        throw new CatalogApiError(
          typeof body?.error === "string" ? body.error : "generic",
        );
      }
      setAddImageUrl(absolutizeStorageUrl(body.url ?? null, window.location.origin));
      toast.success(t("toast.imageUploaded"));
    } catch (error) {
      toast.error(errorText(codeOf(error)));
    } finally {
      setUploadingAddImage(false);
    }
  }

  async function addWord(form: HTMLFormElement) {
    const fd = new FormData(form);
    setBulkBusy(true);
    try {
      const result = await postJson<{ duplicate?: boolean; word?: string }>(
        "/api/admin/vocabulary",
        {
          word: fd.get("word"),
          ipa: fd.get("ipa"),
          meaning_vi: fd.get("meaning_vi"),
          example: fd.get("example"),
          cefr: addCefr || null,
          pos: fd.get("pos"),
          synonyms: fd.get("synonyms"),
          // image optional (spec §2.1) — chỉ gửi khi teacher đã upload
          ...(addImageUrl ? { image_url: addImageUrl } : {}),
          // KHÔNG bookIds — orphan hợp lệ (note trong dialog)
        },
      );
      const word = String(fd.get("word") ?? "").trim();
      if (result.duplicate) toast.info(terr("duplicateWord"));
      else toast.success(t("toast.created", { word }));
      form.reset();
      setAddCefr("");
      setAddImageUrl(null);
      setAdding(false);
      await refetch();
    } catch (error) {
      toast.error(errorText(codeOf(error)));
    } finally {
      setBulkBusy(false);
    }
  }

  // --- dialog sửa từ (full fields + audio + image upload) ---
  const [editing, setEditing] = useState<CatalogWord | null>(null);
  const [editCefr, setEditCefr] = useState<CefrLevel | "">("");
  const [editSource, setEditSource] = useState<"" | "oxford-ld" | "teacher">(
    "",
  );
  const [imageTouched, setImageTouched] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  function openEdit(row: CatalogWord) {
    setEditing(row);
    setEditCefr(
      (CEFR_LEVELS as readonly string[]).includes(row.cefr ?? "")
        ? (row.cefr as CefrLevel)
        : "",
    );
    setEditSource(row.source === "oxford-ld" ? "oxford-ld" : "teacher");
    setImageUrl(row.image_url);
    setImageTouched(false);
  }

  async function uploadImage(file: File) {
    if (!editing) return;
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("wordId", String(editing.id));
      let res: Response;
      try {
        res = await fetch("/api/admin/vocabulary/image", {
          method: "POST",
          body: form,
        });
      } catch {
        throw new CatalogApiError("network");
      }
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        url?: string;
      } | null;
      if (!res.ok || body?.ok !== true) {
        throw new CatalogApiError(
          typeof body?.error === "string" ? body.error : "generic",
        );
      }
      setImageUrl(absolutizeStorageUrl(body.url ?? null, window.location.origin));
      setImageTouched(true);
      toast.success(t("toast.imageUploaded"));
    } catch (error) {
      toast.error(errorText(codeOf(error)));
    } finally {
      setUploadingImage(false);
    }
  }

  async function uploadEditAudio(file: File) {
    if (!editing) return;
    if (file.size > MAX_AUDIO_BYTES) {
      toast.error(tv("audioTooLarge"));
      return;
    }
    if (!mimeToAudioExt(file.type)) {
      toast.error(tv("audioBadFormat"));
      return;
    }
    setUploadingAudio(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("wordId", String(editing.id));
      // route /audio tự PATCH words.audio_url (SF-1) — chỉ update row local
      let res: Response;
      try {
        res = await fetch("/api/admin/vocabulary/audio", {
          method: "POST",
          body: form,
        });
      } catch {
        throw new CatalogApiError("network");
      }
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        url?: string;
      } | null;
      if (!res.ok || body?.ok !== true) {
        throw new CatalogApiError(
          typeof body?.error === "string" ? body.error : "generic",
        );
      }
      const url = body.url ?? null;
      setEditing((prev) => (prev ? { ...prev, audio_url: url } : prev));
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((r) =>
                r.id === editing.id ? { ...r, audio_url: url } : r,
              ),
            }
          : prev,
      );
      toast.success(t("toast.audioUploaded", { word: editing.word }));
    } catch (error) {
      toast.error(errorText(codeOf(error)));
    } finally {
      setUploadingAudio(false);
    }
  }

  async function saveEdit(form: HTMLFormElement) {
    if (!editing) return;
    const fd = new FormData(form);
    setBulkBusy(true);
    try {
      await requestJson(
        "/api/admin/vocabulary",
        "PATCH",
        {
          id: editing.id,
          word: fd.get("word"),
          ipa: fd.get("ipa"),
          meaning_vi: fd.get("meaning_vi"),
          example: fd.get("example"),
          // Radix Select không submit qua FormData — cefr/source từ state
          // (null = clear — PATCH partial theo field)
          cefr: editCefr || null,
          source: editSource === "oxford-ld" ? "oxford-ld" : null,
          pos: fd.get("pos"),
          synonyms: fd.get("synonyms"),
          // chỉ gửi khi teacher đụng ảnh — undefined = giữ nguyên (PATCH partial)
          ...(imageTouched ? { image_url: imageUrl } : {}),
        },
      );
      toast.success(t("toast.saved", { word: String(fd.get("word") ?? "") }));
      setEditing(null);
      await refetch();
    } catch (error) {
      toast.error(errorText(codeOf(error)));
    } finally {
      setBulkBusy(false);
    }
  }

  const bookById = useMemo(
    () => new Map(books.map((b) => [b.id, b])),
    [books],
  );

  const cefrChips = (
    <div
      role="group"
      aria-label={t("filters.cefr")}
      className="flex flex-wrap items-center gap-1"
    >
      {CEFR_LEVELS.map((level) => {
        const active = filters.cefr.includes(level);
        return (
          <Button
            key={level}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            aria-pressed={active}
            className="rounded-[12px] px-2.5 tabular-nums"
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                cefr: toggleCefrFilter(prev.cefr, level),
              }))
            }
          >
            {level}
          </Button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar: search + đếm + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1 max-w-md">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={t("filters.search")}
            className="pl-9"
            aria-label={t("filters.search")}
            title={t("filters.searchHint")}
          />
        </div>
        <span className="text-[13px] font-bold text-muted-foreground tabular-nums">
          {t("count", { count: total })}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            className="rounded-[14px]"
            disabled={exporting}
            onClick={() => void runExport()}
          >
            <Download aria-hidden className="size-4" />
            {exporting ? tc("saving") : t("bulk.export")}
          </Button>
          <Button
            className="rounded-[14px]"
            onClick={() => {
              setAddImageUrl(null);
              setAddCefr("");
              setAdding((v) => !v);
            }}
          >
            <Plus aria-hidden className="size-4" />
            {t("add.button")}
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] border border-border bg-muted/30 px-3.5 py-2.5">
        {cefrChips}
        <div className="flex items-center gap-1.5">
          <Label htmlFor="catalog-source" className="text-[12.5px]">
            {t("filters.source")}
          </Label>
          <Select
            value={filters.source || undefined}
            onValueChange={(v) => {
              setFilters((prev) => ({
                ...prev,
                source: v === "oxford-ld" || v === "teacher" ? v : "",
              }));
              setPage(0);
            }}
          >
            <SelectTrigger id="catalog-source" className="h-8 w-36">
              <SelectValue placeholder={t("filters.sourceAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.sourceAll")}</SelectItem>
              <SelectItem value="oxford-ld">{t("filters.sourceOxford")}</SelectItem>
              <SelectItem value="teacher">{t("filters.sourceTeacher")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="catalog-audio" className="text-[12.5px]">
            {t("filters.audio")}
          </Label>
          <Select
            value={filters.audio || undefined}
            onValueChange={(v) => {
              setFilters((prev) => ({
                ...prev,
                audio: v === "has" || v === "missing" ? v : "",
              }));
              setPage(0);
            }}
          >
            <SelectTrigger id="catalog-audio" className="h-8 w-32">
              <SelectValue placeholder={t("filters.audioAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.audioAll")}</SelectItem>
              <SelectItem value="has">{t("filters.audioHas")}</SelectItem>
              <SelectItem value="missing">{t("filters.audioMissing")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="catalog-book" className="text-[12.5px]">
            {t("filters.book")}
          </Label>
          <Select
            value={filters.bookId !== null ? String(filters.bookId) : undefined}
            onValueChange={(v) => {
              const id = Number(v);
              setFilters((prev) => ({
                ...prev,
                bookId: Number.isInteger(id) && id > 0 ? id : null,
              }));
              setPage(0);
            }}
          >
            <SelectTrigger id="catalog-book" className="h-8 w-44">
              <SelectValue placeholder={t("filters.bookAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.bookAll")}</SelectItem>
              {books.map((book) => (
                <SelectItem key={book.id} value={String(book.id)}>
                  {book.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-bold">
          <input
            type="checkbox"
            checked={filters.orphan}
            onChange={(e) => {
              setFilters((prev) => ({ ...prev, orphan: e.target.checked }));
              setPage(0);
            }}
            className="size-3.5 accent-primary"
          />
          {t("filters.orphan")}
        </label>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="catalog-sort" className="text-[12.5px]">
            {t("filters.sort")}
          </Label>
          <Select
            value={filters.sort}
            onValueChange={(v) => {
              setFilters((prev) => ({
                ...prev,
                sort:
                  v === "word" || v === "cefr" || v === "created" ? v : "created",
              }));
              setPage(0);
            }}
          >
            <SelectTrigger id="catalog-sort" className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created">{t("filters.sortCreated")}</SelectItem>
              <SelectItem value="word">{t("filters.sortWord")}</SelectItem>
              <SelectItem value="cefr">{t("filters.sortCefr")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-[12px]"
          onClick={() => {
            setFilters(DEFAULT_FILTERS);
            setQInput("");
            setPage(0);
          }}
        >
          {t("filters.reset")}
        </Button>
      </div>

      {/* Bảng */}
      {loadError ? (
        <p
          role="alert"
          className="rounded-[18px] border-2 border-dashed border-border bg-card p-8 text-center text-[14px] font-semibold text-destructive"
        >
          {t("error")}
        </p>
      ) : data !== null && rows.length === 0 ? (
        <p className="rounded-[18px] border-2 border-dashed border-border bg-card p-8 text-center text-[14px] font-semibold text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border-2 border-border bg-card">
          <table className="w-full text-[14px]">
            <caption className="sr-only">{t("lead")}</caption>
            <thead>
              <tr className="border-b-2 border-border text-left text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">
                <th scope="col" className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={t("columns.selectAllPage")}
                    checked={
                      rows.length > 0 &&
                      rows.every((row) => selection.isSelected(row.id))
                    }
                    onChange={() => selection.togglePage()}
                    className="size-3.5 accent-primary"
                  />
                </th>
                <th scope="col" className="px-4 py-3">{t("columns.word")}</th>
                <th scope="col" className="px-4 py-3">{t("columns.ipa")}</th>
                <th scope="col" className="px-4 py-3">{t("columns.meaning")}</th>
                <th scope="col" className="px-4 py-3">{t("columns.cefr")}</th>
                <th scope="col" className="px-4 py-3">{t("columns.source")}</th>
                <th scope="col" className="px-4 py-3">{t("columns.audio")}</th>
                <th scope="col" className="px-4 py-3">{t("columns.image")}</th>
                <th scope="col" className="px-4 py-3">{t("columns.books")}</th>
                <th scope="col" className="px-4 py-3 text-right">
                  <span className="sr-only">{tc("edit")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`${t("columns.select")} ${row.word}`}
                      checked={selection.isSelected(row.id)}
                      onChange={() => selection.toggle(row)}
                      className="size-3.5 accent-primary"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold">{row.word}</span>
                      {row.pos ? (
                        <Badge
                          variant="secondary"
                          className="rounded-full text-[11px]"
                        >
                          {row.pos}
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.ipa ? (
                      <span className="font-mono text-[13px]">{row.ipa}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-[280px] px-4 py-3">
                    <span className="line-clamp-2 text-muted-foreground">
                      {row.meaning_vi}
                    </span>
                    {row.synonyms ? (
                      <span
                        className="mt-0.5 block text-[12px] text-muted-foreground/80"
                        title={row.synonyms}
                      >
                        {t("row.synonyms", { list: row.synonyms })}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {row.cefr ? (
                      <Badge variant="secondary" className="tabular-nums">
                        {row.cefr}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground"
                      >
                        {t("row.untagged")}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.source === "oxford-ld" ? (
                      <Badge variant="outline">{t("row.oxford")}</Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground"
                      >
                        {t("row.teacher")}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.audio_url ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("row.audioPlay", { word: row.word })}
                        onClick={() => togglePlay(row)}
                      >
                        {playingId === row.id ? (
                          <VolumeX aria-hidden className="size-4" />
                        ) : (
                          <Volume2 aria-hidden className="size-4" />
                        )}
                      </Button>
                    ) : (
                      <span
                        role="img"
                        aria-label={t("row.noAudio")}
                        className="inline-flex text-muted-foreground/60"
                      >
                        <VolumeX aria-hidden className="size-4" />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.image_url}
                        alt={t("row.hasImage")}
                        title={row.word}
                        className="size-10 rounded-[8px] border border-border object-cover"
                      />
                    ) : (
                      <span
                        role="img"
                        aria-label={t("row.noImage")}
                        className="inline-flex text-muted-foreground/60"
                      >
                        <ImageOff aria-hidden className="size-4" />
                      </span>
                    )}
                  </td>
                  <td className="max-w-[220px] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      {row.bookIds.length === 0 ? (
                        <Badge variant="destructive" className="rounded-full">
                          {t("row.orphan")}
                        </Badge>
                      ) : (
                        row.bookIds.map((bookId) => {
                          const book = bookById.get(bookId);
                          if (!book) return null;
                          return (
                            <LinkBadge
                              key={bookId}
                              slug={book.slug}
                              title={book.title}
                              label={t("row.bookLink", { book: book.title })}
                            />
                          );
                        })
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${tc("edit")} ${row.word}`}
                      onClick={() => openEdit(row)}
                    >
                      <Pencil aria-hidden className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-muted-foreground tabular-nums">
          {t("pagination.status", { page: page + 1, total: totalPages })}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-[12px]"
            aria-label={t("pagination.prev")}
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-[12px]"
            aria-label={t("pagination.next")}
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </div>
      </div>

      {/* Bulk bar — ẩn khi count=0 (tier-0) */}
      <BulkActionBar count={selection.count} onClear={selection.clear}>
        <Button
          size="sm"
          variant="outline"
          className="rounded-[12px]"
          onClick={() => {
            setAssignBookIds([]);
            setAssignOpen(true);
          }}
        >
          {t("bulk.assignBooks")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-[12px]"
          onClick={() => {
            setTagLevel("");
            setTagOpen(true);
          }}
        >
          {t("bulk.tagCefr")}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="rounded-[12px]"
          disabled={deleteChecking}
          onClick={() => void prepareDelete()}
        >
          {deleteChecking ? t("bulk.deleteChecking") : t("bulk.delete")}
        </Button>
      </BulkActionBar>

      {/* Dialog gán sách */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="rounded-[12px] sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[17px] font-bold">
              {t("bulk.assignTitle", { count: selection.count })}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              {t("bulk.assignHint")}
            </DialogDescription>
          </DialogHeader>
          <fieldset className="max-h-64 space-y-1.5 overflow-y-auto rounded-[12px] border border-border p-3">
            <legend className="sr-only">{t("bulk.assignBooks")}</legend>
            {books.map((book) => (
              <label
                key={book.id}
                className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-[13.5px] font-semibold hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={assignBookIds.includes(book.id)}
                  onChange={(e) =>
                    setAssignBookIds((prev) =>
                      e.target.checked
                        ? [...prev, book.id]
                        : prev.filter((id) => id !== book.id),
                    )
                  }
                  className="size-3.5 accent-primary"
                />
                {book.title}
              </label>
            ))}
          </fieldset>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button disabled={bulkBusy} onClick={() => void runAssignBooks()}>
              {bulkBusy ? tc("saving") : t("bulk.assignSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog tag CEFR (OVERWRITE) */}
      <Dialog open={tagOpen} onOpenChange={setTagOpen}>
        <DialogContent className="rounded-[12px] sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[17px] font-bold">
              {t("bulk.tagTitle", { count: selection.count })}
            </DialogTitle>
            <DialogDescription className="text-[13px] font-bold text-destructive">
              {t("bulk.tagOverwrite")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-tag-cefr">{t("filters.cefr")}</Label>
            <Select
              value={tagLevel}
              onValueChange={(v) =>
                setTagLevel(
                  (CEFR_LEVELS as readonly string[]).includes(v)
                    ? (v as CefrLevel)
                    : "",
                )
              }
            >
              <SelectTrigger id="bulk-tag-cefr" className="w-36">
                <SelectValue placeholder={t("row.untagged")} />
              </SelectTrigger>
              <SelectContent>
                {CEFR_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTagOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button disabled={bulkBusy} onClick={() => void runTagCefr()}>
              {bulkBusy ? tc("saving") : t("bulk.tagSubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm xoá 2-phase (ConfirmDialog tier-0 — plan từ dry-run) */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={t("bulk.deleteTitle", { count: deletePlan?.willDelete ?? 0 })}
        description={
          deletePlan ? (
            <span className="space-y-1.5">
              <span className="block">
                {t("bulk.deleteWarning", {
                  willDelete: deletePlan.willDelete,
                  progressAffected: deletePlan.progressAffected,
                })}
              </span>
              {deletePlan.missing.length > 0 ? (
                <span className="block font-semibold text-muted-foreground">
                  {t("bulk.deleteMissing", { count: deletePlan.missing.length })}
                </span>
              ) : null}
            </span>
          ) : (
            t("bulk.deleteChecking")
          )
        }
        onConfirm={() => void applyDelete()}
        confirmLabel={t("bulk.deleteSubmit")}
        cancelLabel={tc("cancel")}
      />

      {/* Dialog thêm từ (global — orphan hợp lệ) */}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="rounded-[12px] sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[17px] font-bold">
              {t("add.title")}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              {t("add.orphanNote")}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addWord(e.currentTarget);
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="catalog-add-word">{t("add.fieldWord")}</Label>
                <Input
                  id="catalog-add-word"
                  name="word"
                  required
                  maxLength={100}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="catalog-add-ipa">{t("add.fieldIpa")}</Label>
                <Input id="catalog-add-ipa" name="ipa" maxLength={100} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="catalog-add-meaning">
                  {t("add.fieldMeaning")}
                </Label>
                <Input
                  id="catalog-add-meaning"
                  name="meaning_vi"
                  required
                  maxLength={500}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="catalog-add-example">
                  {t("add.fieldExample")}
                </Label>
                <Textarea
                  id="catalog-add-example"
                  name="example"
                  rows={2}
                  maxLength={1000}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="catalog-add-cefr">{t("add.fieldCefr")}</Label>
                <Select
                  value={addCefr}
                  onValueChange={(v) =>
                    setAddCefr(
                      (CEFR_LEVELS as readonly string[]).includes(v)
                        ? (v as CefrLevel)
                        : "",
                    )
                  }
                >
                  <SelectTrigger id="catalog-add-cefr" className="w-full">
                    <SelectValue placeholder={t("add.fieldCefrNone")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CEFR_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="catalog-add-pos">{t("add.fieldPos")}</Label>
                <Input
                  id="catalog-add-pos"
                  name="pos"
                  maxLength={32}
                  placeholder="noun"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="catalog-add-synonyms">
                  {t("add.fieldSynonyms")}
                </Label>
                <Input
                  id="catalog-add-synonyms"
                  name="synonyms"
                  maxLength={500}
                />
              </div>
            </div>

            {/* Image optional lúc tạo (spec §2.1) — route /image không cần
                wordId → path tmp-{ts}.{ext}; preview trước submit */}
            <div className="space-y-1.5">
              <Label htmlFor="catalog-add-image">{t("edit.fieldImage")}</Label>
              <div className="flex items-center gap-3">
                {addImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={addImageUrl}
                    alt={t("edit.imagePreview")}
                    className="size-16 rounded-[8px] border border-border object-cover"
                  />
                ) : (
                  <span
                    role="img"
                    aria-label={t("row.noImage")}
                    className="inline-flex size-16 items-center justify-center rounded-[8px] border border-dashed border-border text-muted-foreground/60"
                  >
                    <ImageOff aria-hidden className="size-5" />
                  </span>
                )}
                <label
                  htmlFor="catalog-add-image"
                  className="cursor-pointer rounded-[12px] px-3 py-1.5 text-[13px] font-bold text-primary transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
                >
                  {uploadingAddImage
                    ? t("edit.imageUploading")
                    : t("edit.imageUpload")}
                  <input
                    id="catalog-add-image"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={uploadingAddImage}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadAddImage(file);
                    }}
                  />
                </label>
                {addImageUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-[12px]"
                    onClick={() => setAddImageUrl(null)}
                  >
                    {t("edit.imageRemove")}
                  </Button>
                ) : null}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={bulkBusy}
                onClick={() => setAdding(false)}
              >
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={bulkBusy} className="rounded-[14px]">
                {bulkBusy ? tc("saving") : t("add.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog sửa từ (full fields + audio + image upload) */}
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      >
        <DialogContent className="rounded-[12px] sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="font-display text-[17px] font-bold">
              {editing ? t("edit.title", { word: editing.word }) : ""}
            </DialogTitle>
          </DialogHeader>
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveEdit(e.currentTarget);
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="catalog-edit-word">{t("add.fieldWord")}</Label>
                  <Input
                    id="catalog-edit-word"
                    name="word"
                    defaultValue={editing.word}
                    required
                    maxLength={100}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="catalog-edit-ipa">{t("add.fieldIpa")}</Label>
                  <Input
                    id="catalog-edit-ipa"
                    name="ipa"
                    defaultValue={editing.ipa ?? ""}
                    maxLength={100}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="catalog-edit-meaning">
                    {t("add.fieldMeaning")}
                  </Label>
                  <Input
                    id="catalog-edit-meaning"
                    name="meaning_vi"
                    defaultValue={editing.meaning_vi}
                    required
                    maxLength={500}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="catalog-edit-example">
                    {t("add.fieldExample")}
                  </Label>
                  <Textarea
                    id="catalog-edit-example"
                    name="example"
                    defaultValue={editing.example ?? ""}
                    rows={2}
                    maxLength={1000}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="catalog-edit-cefr">{t("edit.fieldCefr")}</Label>
                  <Select
                    value={editCefr}
                    onValueChange={(v) =>
                      setEditCefr(
                        (CEFR_LEVELS as readonly string[]).includes(v)
                          ? (v as CefrLevel)
                          : "",
                      )
                    }
                  >
                    <SelectTrigger id="catalog-edit-cefr" className="w-full">
                      <SelectValue placeholder={t("edit.fieldCefrNone")} />
                    </SelectTrigger>
                    <SelectContent>
                      {CEFR_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="catalog-edit-source">
                    {t("edit.fieldSource")}
                  </Label>
                  <Select
                    value={editSource}
                    onValueChange={(v) =>
                      setEditSource(v === "oxford-ld" ? "oxford-ld" : "teacher")
                    }
                  >
                    <SelectTrigger id="catalog-edit-source" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teacher">
                        {t("edit.fieldSourceNone")}
                      </SelectItem>
                      <SelectItem value="oxford-ld">
                        {t("row.oxford")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="catalog-edit-pos">{t("edit.fieldPos")}</Label>
                  <Input
                    id="catalog-edit-pos"
                    name="pos"
                    defaultValue={editing.pos ?? ""}
                    maxLength={32}
                    placeholder="noun"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="catalog-edit-synonyms">
                    {t("edit.fieldSynonyms")}
                  </Label>
                  <Input
                    id="catalog-edit-synonyms"
                    name="synonyms"
                    defaultValue={editing.synonyms ?? ""}
                    maxLength={500}
                  />
                </div>
              </div>

              {/* Audio upload — route /audio có sẵn (tự PATCH audio_url) */}
              <div className="space-y-1.5">
                <Label htmlFor="catalog-edit-audio">
                  {t("edit.fieldAudio")}
                </Label>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={editing.audio_url ? "secondary" : "outline"}
                    className="rounded-full"
                  >
                    {editing.audio_url
                      ? t("edit.audioHas")
                      : t("edit.audioMissing")}
                  </Badge>
                  <label
                    htmlFor="catalog-edit-audio"
                    className="cursor-pointer rounded-[12px] px-3 py-1.5 text-[13px] font-bold text-primary transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
                  >
                    {uploadingAudio
                      ? t("edit.audioUploading")
                      : t("edit.audioUpload")}
                    <input
                      id="catalog-edit-audio"
                      type="file"
                      accept="audio/*"
                      className="sr-only"
                      disabled={uploadingAudio}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void uploadEditAudio(file);
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Image upload + preview thumb trước save */}
              <div className="space-y-1.5">
                <Label htmlFor="catalog-edit-image">
                  {t("edit.fieldImage")}
                </Label>
                <div className="flex items-center gap-3">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt={t("edit.imagePreview")}
                      className="size-16 rounded-[8px] border border-border object-cover"
                    />
                  ) : (
                    <span
                      role="img"
                      aria-label={t("row.noImage")}
                      className="inline-flex size-16 items-center justify-center rounded-[8px] border border-dashed border-border text-muted-foreground/60"
                    >
                      <ImageOff aria-hidden className="size-5" />
                    </span>
                  )}
                  <label
                    htmlFor="catalog-edit-image"
                    className="cursor-pointer rounded-[12px] px-3 py-1.5 text-[13px] font-bold text-primary transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
                  >
                    {uploadingImage
                      ? t("edit.imageUploading")
                      : t("edit.imageUpload")}
                    <input
                      id="catalog-edit-image"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={uploadingImage}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void uploadImage(file);
                      }}
                    />
                  </label>
                  {imageUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-[12px]"
                      onClick={() => {
                        setImageUrl(null);
                        setImageTouched(true);
                      }}
                    >
                      {t("edit.imageRemove")}
                    </Button>
                  ) : null}
                </div>
              </div>

              <DialogFooter className="gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(null)}
                >
                  {tc("cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={bulkBusy}
                  className="rounded-[14px]"
                >
                  {bulkBusy ? tc("saving") : t("edit.submit")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Chip sách — link (client nav) sang per-book manager cũ (regression surface). */
function LinkBadge({
  slug,
  title,
  label,
}: {
  slug: string;
  title: string;
  label: string;
}) {
  return (
    <Link
      href={`/admin/books/${slug}/vocabulary`}
      aria-label={label}
      title={title}
      className="rounded-full border px-2 py-0.5 text-[11.5px] font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      {title}
    </Link>
  );
}
