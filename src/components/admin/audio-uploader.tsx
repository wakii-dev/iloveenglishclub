"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CloudUpload, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminPartRow } from "@/lib/admin/queries";
import {
  numericFileSort,
  parseFileNameIndex,
  type IndexedFile,
} from "@/lib/admin/audio-mapping";

/**
 * Bulk upload audio (spec §6.3): dropzone nhiều file → parse số đầu tên →
 * sort NUMERIC → auto-map file#N → part#N; per-file status + RETRY RIÊNG file
 * fail; durationMs đọc client (Audio metadata, fail-soft); file thừa/ít/sai
 * định dạng → warning liệt kê rõ. Upload TUẦN TỰ (đơn giản, tránh flood).
 * Replace: chọn lại file cho part qua hàng "thay audio".
 */

type UploadItem = IndexedFile<File> & {
  id: string;
  targetPart: number | null;
  status: "ready" | "uploading" | "done" | "error";
  errorMessage?: string;
};

type UploadErrorKey =
  | "unsupportedFormat"
  | "tooLarge"
  | "partNotFound"
  | "network"
  | "forbidden";

async function readDurationMs(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const finish = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 5000); // fail-soft timeout
    audio.addEventListener("loadedmetadata", () => {
      clearTimeout(timer);
      finish(
        Number.isFinite(audio.duration)
          ? Math.round(audio.duration * 1000)
          : null,
      );
    });
    audio.addEventListener("error", () => {
      clearTimeout(timer);
      finish(null);
    });
    audio.src = url;
  });
}

export function AudioUploader({
  lessonId,
  parts,
}: {
  lessonId: number;
  parts: AdminPartRow[];
}) {
  const t = useTranslations("admin.uploader");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replacePart, setReplacePart] = useState<string>("");

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const incoming = numericFileSort(
      Array.from(fileList).map((file, i) => ({
        file,
        name: file.name,
        index: parseFileNameIndex(file.name),
        id: `${Date.now()}-${i}-${file.name}`,
        targetPart: null as number | null,
        status: "ready" as const,
      })),
    ).map((f) => ({
      ...f,
      // auto-map: file#N → part#N; vượt tổng part → để null (warning liệt kê)
      targetPart: f.index !== null && f.index <= parts.length ? f.index : null,
    }));
    setItems((prev) => [...prev, ...incoming]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function setItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function uploadOne(item: UploadItem): Promise<boolean> {
    if (item.targetPart === null) return false;
    setItem(item.id, { status: "uploading", errorMessage: undefined });
    try {
      const durationMs = await readDurationMs(item.file);
      const form = new FormData();
      form.set("file", item.file);
      form.set("lessonId", String(lessonId));
      form.set("partIndex", String(item.targetPart));
      if (durationMs !== null) form.set("durationMs", String(durationMs));
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      if (res.ok) {
        setItem(item.id, { status: "done" });
        return true;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: UploadErrorKey };
      setItem(item.id, {
        status: "error",
        errorMessage: body.error ?? "network",
      });
      return false;
    } catch {
      setItem(item.id, { status: "error", errorMessage: "network" });
      return false;
    }
  }

  function uploadAll() {
    setUploading(true);
    startTransition(async () => {
      const queue = items.filter((it) => it.status !== "done" && it.targetPart !== null);
      for (const item of queue) {
        await uploadOne(item);
      }
      setUploading(false);
      toast.success(t("done"));
      router.refresh();
    });
  }

  async function retry(item: UploadItem) {
    setUploading(true);
    const ok = await uploadOne(item);
    setUploading(false);
    if (ok) {
      toast.success(item.name);
      router.refresh();
    }
  }

  function replaceWithPart(fileList: FileList | null) {
    const partIndex = Number(replacePart);
    const file = fileList?.[0];
    if (!file || !Number.isInteger(partIndex)) return;
    const item: UploadItem = {
      id: `${Date.now()}-replace-${file.name}`,
      file,
      name: file.name,
      index: parseFileNameIndex(file.name),
      targetPart: partIndex,
      status: "ready",
    };
    setItems((prev) => [...prev, item]);
    setReplacePart("");
    setUploading(true);
    startTransition(async () => {
      const ok = await uploadOne(item);
      setUploading(false);
      if (ok) {
        toast.success(t("replaced", { part: partIndex }));
        router.refresh();
      }
    });
  }

  const pendingCount = items.filter(
    (it) => it.status === "ready" && it.targetPart !== null,
  ).length;
  const errorItems = items.filter((it) => it.status === "error");
  const unmapped = items.filter((it) => it.targetPart === null);
  const duplicateIndexes = [
    ...new Set(
      items
        .filter((it) => it.index !== null)
        .map((it) => it.index!)
        .filter((idx, i, arr) => arr.indexOf(idx) !== i),
    ),
  ];
  const partsMissingAudio = parts.filter((p) => p.audioPath === null);

  const errLabel = (key: UploadErrorKey | string) => {
    const known: Record<string, string> = {
      unsupportedFormat: t("errFormat"),
      tooLarge: t("errLarge"),
      partNotFound: t("errPart"),
      forbidden: t("errForbidden"),
      network: t("errNetwork"),
    };
    return known[key] ?? t("errNetwork");
  };

  return (
    <section className="rounded-[18px] border-2 border-border bg-card p-5">
      <p className="font-display text-[17px] font-bold">{t("title")}</p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        className="mt-3 rounded-[14px] border-2 border-dashed border-input bg-muted/40 p-6 text-center"
      >
        <CloudUpload aria-hidden className="mx-auto size-6 text-secondary" />
        <p className="mt-2 text-[13.5px] font-semibold text-muted-foreground">
          {t("dropHint")}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={(e) => addFiles(e.target.files)}
          aria-label={t("title")}
          className="mx-auto mt-3 block w-fit text-[13px] file:mr-3 file:rounded-[12px] file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-[13px] file:font-bold file:text-primary-foreground"
        />
      </div>

      {duplicateIndexes.length > 0 ? (
        <p className="mt-3 rounded-[14px] bg-muted px-3.5 py-2.5 text-[13px] font-bold text-muted-foreground tabular-nums">
          {t("duplicateWarning", { parts: duplicateIndexes.join(", ") })}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              data-upload-row={item.name}
              className="flex items-center gap-3 rounded-[14px] border border-border bg-muted/30 px-3.5 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                {item.name}
              </span>
              <div className="w-32 shrink-0">
                <Select
                  value={item.targetPart !== null ? String(item.targetPart) : undefined}
                  onValueChange={(v) =>
                    setItem(item.id, {
                      targetPart: Number(v),
                      status: "ready",
                    })
                  }
                  disabled={uploading}
                >
                  <SelectTrigger aria-label={t("mapTo")} className="h-8">
                    <SelectValue placeholder={t("unmapped")} />
                  </SelectTrigger>
                  <SelectContent>
                    {parts.map((p) => (
                      <SelectItem key={p.id} value={String(p.sortOrder)}>
                        {t("partN", { n: p.sortOrder })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {item.status === "uploading" ? (
                <Badge variant="outline" className="shrink-0 rounded-full">
                  {t("uploading")}
                </Badge>
              ) : item.status === "done" ? (
                <Badge variant="secondary" className="shrink-0 rounded-full">
                  {t("done")}
                </Badge>
              ) : item.status === "error" ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="destructive" className="rounded-full">
                    {errLabel(item.errorMessage ?? "network")}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`${t("retryOne")} ${item.name}`}
                    title={t("retryOne")}
                    disabled={uploading}
                    onClick={() => retry(item)}
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                  </Button>
                </span>
              ) : (
                <Badge
                  variant="outline"
                  className="shrink-0 rounded-full text-muted-foreground"
                >
                  {t("ready")}
                </Badge>
              )}
            </div>
          ))}

          {pendingCount > 0 ? (
            <Button onClick={uploadAll} disabled={uploading} className="rounded-[14px]">
              <Upload aria-hidden className="size-4" />
              {uploading ? t("uploading") : t("uploadAll", { count: pendingCount })}
            </Button>
          ) : null}
          {errorItems.length > 0 ? (
            <p className="text-[13px] font-bold text-destructive tabular-nums">
              {t("errorSummary", { count: errorItems.length })}
            </p>
          ) : null}
          {unmapped.length > 0 ? (
            <p className="text-[13px] font-bold text-muted-foreground tabular-nums">
              {t("unmappedSummary", {
                names: unmapped.map((u) => u.name).join(", "),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <span className="text-[13.5px] font-bold">{t("replaceLabel")}</span>
        <div className="w-44">
          <Select value={replacePart} onValueChange={setReplacePart}>
            <SelectTrigger aria-label={t("replaceLabel")} className="h-8">
              <SelectValue placeholder={t("partN", { n: "…" })} />
            </SelectTrigger>
            <SelectContent>
              {parts.map((p) => (
                <SelectItem key={p.id} value={String(p.sortOrder)}>
                  {t("partN", { n: p.sortOrder })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="cursor-pointer rounded-[12px] px-3 py-1.5 text-[13px] font-bold text-primary transition-colors hover:bg-accent focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2">
          {t("replacePick")}
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            disabled={!replacePart || uploading}
            onChange={(e) => replaceWithPart(e.target.files)}
          />
        </label>
      </div>

      {partsMissingAudio.length > 0 ? (
        <p className="mt-3 text-[13px] font-bold text-muted-foreground tabular-nums">
          {t("missingSummary", {
            parts: partsMissingAudio.map((p) => p.sortOrder).join(", "),
          })}
        </p>
      ) : (
        <p className="mt-3 text-[13px] font-bold text-success">
          {t("allMapped")}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {uploading ? t("uploading") : ""}
      </p>
    </section>
  );
}
