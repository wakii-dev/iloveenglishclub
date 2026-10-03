"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  FileUp,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { MAX_AUDIO_BYTES, mimeToAudioExt } from "@/lib/admin/audio-mapping";
import { resolveStoredAudioUrl } from "@/lib/admin/vocabulary";

/**
 * Quản lý từ theo book (SF-1 t-1.3): bảng word/IPA/nghĩa/audio + form
 * thêm/sửa/xoá + panel import JSON/CSV (báo cáo lỗi từng dòng) + upload audio
 * per-row. Mutations gọi REST /api/admin/vocabulary (t-1.2) rồi refetch —
 * server action không dùng vì import/audio cần report lỗi line-level.
 */

export type AdminWordRow = {
  id: number;
  word: string;
  ipa: string | null;
  meaning_vi: string;
  example: string | null;
  audio_url: string | null;
};

type ImportReportUi = {
  total: number;
  imported: number;
  linked: number;
  skipped: number;
  errors: { line: number; word: string; error: string }[];
};

class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function callApi<T extends Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("network");
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.ok === false) {
    throw new ApiError(typeof body.error === "string" ? body.error : "generic");
  }
  return body as T;
}

export function VocabularyManager({
  bookId,
  initialRows,
}: {
  bookId: number;
  initialRows: AdminWordRow[];
}) {
  const t = useTranslations("admin.vocabulary");
  const ti = useTranslations("admin.vocabulary.import");
  const terr = useTranslations("admin.vocabulary.errors");
  const te = useTranslations("admin.errors");
  const tc = useTranslations("admin.common");
  const [rows, setRows] = useState<AdminWordRow[]>(initialRows);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importFormat, setImportFormat] = useState<"json" | "csv">("json");
  const [report, setReport] = useState<ImportReportUi | null>(null);
  const [editing, setEditing] = useState<AdminWordRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const errorText = (code: string) =>
    terr.has(code) ? terr(code) : te("generic");
  const codeOf = (error: unknown) =>
    error instanceof ApiError ? error.code : "generic";

  async function refetch() {
    const data = await callApi<{ items: AdminWordRow[] }>(
      `/api/admin/vocabulary?bookId=${bookId}&limit=200`,
    );
    setRows(data.items);
  }

  async function addWord(form: HTMLFormElement) {
    const fd = new FormData(form);
    const word = String(fd.get("word") ?? "").trim();
    setBusy(true);
    try {
      const data = await callApi<{ duplicate?: boolean }>(
        "/api/admin/vocabulary",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            word,
            ipa: fd.get("ipa"),
            meaning_vi: fd.get("meaning_vi"),
            example: fd.get("example"),
            audio_url: fd.get("audio_url"),
            bookIds: [bookId],
          }),
        },
      );
      if (data.duplicate) toast.info(t("duplicateNote"));
      else toast.success(t("created", { word }));
      form.reset();
      await refetch();
    } catch (error) {
      toast.error(errorText(codeOf(error)));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(form: HTMLFormElement) {
    if (!editing) return;
    const fd = new FormData(form);
    setBusy(true);
    try {
      await callApi("/api/admin/vocabulary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          word: fd.get("word"),
          ipa: fd.get("ipa"),
          meaning_vi: fd.get("meaning_vi"),
          example: fd.get("example"),
        }),
      });
      toast.success(tc("save"));
      setEditing(null);
      await refetch();
    } catch (error) {
      toast.error(errorText(codeOf(error)));
    } finally {
      setBusy(false);
    }
  }

  async function removeWord(row: AdminWordRow) {
    if (!window.confirm(t("deleteConfirm", { word: row.word }))) return;
    try {
      await callApi(`/api/admin/vocabulary?id=${row.id}`, { method: "DELETE" });
      toast.success(tc("delete"));
      await refetch();
    } catch (error) {
      toast.error(errorText(codeOf(error)));
    }
  }

  async function uploadAudio(row: AdminWordRow, file: File) {
    if (file.size > MAX_AUDIO_BYTES) {
      toast.error(t("audioTooLarge"));
      return;
    }
    if (!mimeToAudioExt(file.type)) {
      toast.error(t("audioBadFormat"));
      return;
    }
    setUploadingId(row.id);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("wordId", String(row.id));
      const data = await callApi<{ url: string }>(
        "/api/admin/vocabulary/audio",
        { method: "POST", body: form },
      );
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, audio_url: data.url } : r)),
      );
      toast.success(t("audioSaved", { word: row.word }));
    } catch (error) {
      toast.error(errorText(codeOf(error)));
    } finally {
      setUploadingId(null);
    }
  }

  function togglePlay(row: AdminWordRow) {
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

  async function runImport(form: HTMLFormElement) {
    const fd = new FormData(form);
    const content = String(fd.get("content") ?? "");
    setBusy(true);
    try {
      const data = await callApi<ImportReportUi>(
        "/api/admin/vocabulary/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookId, format: importFormat, content }),
        },
      );
      setReport(data);
      toast.success(
        ti("report", {
          imported: data.imported,
          linked: data.linked,
          skipped: data.skipped,
          total: data.total,
        }),
      );
      await refetch();
    } catch (error) {
      toast.error(errorText(codeOf(error)));
    } finally {
      setBusy(false);
    }
  }

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? rows.filter(
        (r) =>
          r.word.toLowerCase().includes(needle) ||
          r.meaning_vi.toLowerCase().includes(needle),
      )
    : rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
            className="pl-9"
            aria-label={t("search")}
          />
        </div>
        <span className="text-[13px] font-bold text-muted-foreground tabular-nums">
          {t("count", { count: rows.length })}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            className="rounded-[14px]"
            onClick={() => {
              setShowImport((v) => !v);
              setReport(null);
            }}
          >
            <FileUp aria-hidden className="size-4" />
            {ti("title")}
          </Button>
          <Button
            className="rounded-[14px]"
            onClick={() => setAdding((v) => !v)}
          >
            <Plus aria-hidden className="size-4" />
            {t("add")}
          </Button>
        </div>
      </div>

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addWord(e.currentTarget);
          }}
          className="w-full max-w-xl rounded-[18px] border-2 border-border bg-card p-5"
        >
          <p className="font-display text-[17px] font-bold">{t("add")}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="word-text">{t("fieldWord")}</Label>
              <Input
                id="word-text"
                name="word"
                required
                maxLength={100}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="word-ipa">{t("fieldIpa")}</Label>
              <Input id="word-ipa" name="ipa" maxLength={100} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="word-meaning">{t("fieldMeaning")}</Label>
              <Input
                id="word-meaning"
                name="meaning_vi"
                required
                maxLength={500}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="word-example">{t("fieldExample")}</Label>
              <Textarea id="word-example" name="example" rows={2} maxLength={1000} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="word-audio-url">{t("fieldAudioUrl")}</Label>
              <Input
                id="word-audio-url"
                name="audio_url"
                type="url"
                placeholder="https://…"
                maxLength={1000}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={busy} className="rounded-[14px]">
              {busy ? tc("saving") : tc("create")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setAdding(false)}
            >
              {tc("cancel")}
            </Button>
          </div>
        </form>
      ) : null}

      {showImport ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runImport(e.currentTarget);
          }}
          className="w-full rounded-[18px] border-2 border-border bg-card p-5"
        >
          <p className="font-display text-[17px] font-bold">{ti("title")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{ti("hint")}</p>
          <div className="mt-3 flex items-center gap-3">
            <Label htmlFor="import-format">{ti("format")}</Label>
            <Select
              value={importFormat}
              onValueChange={(v) => setImportFormat(v === "csv" ? "csv" : "json")}
            >
              <SelectTrigger id="import-format" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">{ti("formatJson")}</SelectItem>
                <SelectItem value="csv">{ti("formatCsv")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            name="content"
            rows={8}
            required
            className="mt-3 font-mono text-[13px]"
            placeholder={ti("placeholder")}
          />
          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={busy} className="rounded-[14px]">
              {busy ? ti("importing") : ti("submit")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setShowImport(false)}
            >
              {tc("cancel")}
            </Button>
          </div>
          {report ? (
            <div className="mt-4 space-y-2 rounded-[12px] bg-muted/60 p-4 text-[13px]">
              <p className="font-bold">
                {ti("report", {
                  imported: report.imported,
                  linked: report.linked,
                  skipped: report.skipped,
                  total: report.total,
                })}
              </p>
              {report.errors.length > 0 ? (
                <div>
                  <p className="font-bold text-destructive">
                    {ti("errorsTitle", { count: report.errors.length })}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {report.errors.map((e, i) => (
                      <li key={`${e.line}-${i}`}>
                        {ti("lineError", {
                          line: e.line,
                          word: e.word,
                          error: errorText(e.error),
                        })}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </form>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-[18px] border-2 border-dashed border-border bg-card p-8 text-center text-[14px] font-semibold text-muted-foreground">
          {t("empty")}
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-[18px] border-2 border-dashed border-border bg-card p-8 text-center text-[14px] font-semibold text-muted-foreground">
          {t("emptyFiltered")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border-2 border-border bg-card">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b-2 border-border text-left text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">
                <th className="px-4 py-3">{t("colWord")}</th>
                <th className="px-4 py-3">{t("colIpa")}</th>
                <th className="px-4 py-3">{t("colMeaning")}</th>
                <th className="px-4 py-3">{t("colAudio")}</th>
                <th className="px-4 py-3 text-right">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/60 last:border-0"
                >
                  <td className="px-4 py-3 font-bold">{row.word}</td>
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
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {row.audio_url ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={
                              playingId === row.id ? t("stop") : t("play")
                            }
                            onClick={() => togglePlay(row)}
                          >
                            {playingId === row.id ? (
                              <Pause aria-hidden className="size-4" />
                            ) : (
                              <Play aria-hidden className="size-4" />
                            )}
                          </Button>
                          <Badge variant="secondary">{t("hasAudio")}</Badge>
                        </>
                      ) : (
                        <Badge variant="outline">{t("noAudio")}</Badge>
                      )}
                      <label className="sr-only" htmlFor={`audio-file-${row.id}`}>
                        {t("upload")}
                      </label>
                      <input
                        id={`audio-file-${row.id}`}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) void uploadAudio(row, file);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("upload")}
                        disabled={uploadingId === row.id}
                        onClick={() =>
                          document.getElementById(`audio-file-${row.id}`)?.click()
                        }
                      >
                        <Upload
                          aria-hidden
                          className={uploadingId === row.id ? "size-4 animate-pulse" : "size-4"}
                        />
                      </Button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={tc("edit")}
                        onClick={() => setEditing(row)}
                      >
                        <Pencil aria-hidden className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={tc("delete")}
                        className="text-destructive hover:text-destructive"
                        onClick={() => void removeWord(row)}
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              {editing ? t("editTitle", { word: editing.word }) : ""}
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
              <div className="space-y-1.5">
                <Label htmlFor="edit-word">{t("fieldWord")}</Label>
                <Input
                  id="edit-word"
                  name="word"
                  defaultValue={editing.word}
                  required
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-ipa">{t("fieldIpa")}</Label>
                <Input
                  id="edit-ipa"
                  name="ipa"
                  defaultValue={editing.ipa ?? ""}
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-meaning">{t("fieldMeaning")}</Label>
                <Input
                  id="edit-meaning"
                  name="meaning_vi"
                  defaultValue={editing.meaning_vi}
                  required
                  maxLength={500}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-example">{t("fieldExample")}</Label>
                <Textarea
                  id="edit-example"
                  name="example"
                  defaultValue={editing.example ?? ""}
                  rows={2}
                  maxLength={1000}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={busy} className="rounded-[14px]">
                  {busy ? tc("saving") : tc("save")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(null)}
                >
                  {tc("cancel")}
                </Button>
              </div>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
