"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Merge, Plus, Scissors, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { splitSentences } from "@/lib/content/split-sentences";
import { addPartsFromScriptAction } from "@/lib/actions/admin/parts";

/**
 * Script → Split → manual fix → thêm vào bài (spec §6.3 bước 1).
 * Split chạy CLIENT bằng chính module splitSentences (SF-3, pure) — server
 * nhận mảng câu CUỐI (single source of truth vẫn là server: sanitize lại).
 * Manual fix: gộp dòng dưới / tách / thêm / xóa (không move — move ở
 * parts-editor sau khi đã thêm).
 */
export function ScriptSplitter({ lessonId }: { lessonId: number }) {
  const t = useTranslations("admin.splitter");
  const te = useTranslations("admin.errors");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const [script, setScript] = useState("");
  const [lines, setLines] = useState<string[] | null>(null);
  // số câu THẬT sẽ chèn (bỏ dòng rỗng — QA-303: toast/nút cũ đếm raw)
  const nonEmptyCount = lines?.filter((l) => l.trim().length > 0).length ?? 0;
  const [pending, startTransition] = useTransition();

  function doSplit() {
    setLines(splitSentences(script));
  }

  function reset() {
    setScript("");
    setLines(null);
  }

  function save() {
    if (!lines) return;
    // đếm câu non-empty — toast/nút dùng số THẬT sẽ chèn (QA-303: bản cũ đếm
    // raw lines.length gồm dòng rỗng, lệch với số server chèn)
    if (nonEmptyCount === 0) return;
    startTransition(async () => {
      const result = await addPartsFromScriptAction(lessonId, lines);
      if (result?.error) {
        toast.error(te(result.error));
        return;
      }
      toast.success(t("add", { count: nonEmptyCount }));
      reset();
      router.refresh();
    });
  }

  function setLine(i: number, value: string) {
    setLines((prev) => prev?.map((l, j) => (j === i ? value : l)) ?? null);
  }

  function mergeDown(i: number) {
    setLines((prev) => {
      if (!prev || i >= prev.length - 1) return prev;
      const merged = `${prev[i]} ${prev[i + 1]}`.trim();
      return [...prev.slice(0, i), merged, ...prev.slice(i + 2)];
    });
  }

  function splitLine(i: number) {
    setLines((prev) => {
      if (!prev) return prev;
      const pieces = splitSentences(prev[i]);
      if (pieces.length < 2) return prev;
      return [...prev.slice(0, i), ...pieces, ...prev.slice(i + 1)];
    });
  }

  function removeLine(i: number) {
    setLines((prev) => prev?.filter((_, j) => j !== i) ?? null);
  }

  function addLine(i: number) {
    setLines((prev) => {
      if (!prev) return prev;
      return [...prev.slice(0, i + 1), "", ...prev.slice(i + 1)];
    });
  }

  return (
    <section className="rounded-[18px] border-2 border-border bg-card p-5">
      <p className="font-display text-[17px] font-bold">{t("title")}</p>

      {lines === null ? (
        <div className="mt-3 space-y-3">
          <Textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={t("pastePlaceholder")}
            rows={7}
            className="rounded-2xl border-2 border-dashed border-input text-[15px] leading-relaxed"
          />
          <div className="flex gap-2">
            <Button
              onClick={doSplit}
              disabled={!script.trim()}
              className="rounded-[14px]"
            >
              <Scissors aria-hidden className="size-4" />
              {t("split")}
            </Button>
            {script ? (
              <Button variant="ghost" onClick={reset}>
                {t("clear")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-[13.5px] font-bold text-muted-foreground tabular-nums">
            {t("preview", { count: lines.length })}
          </p>
          <p className="rounded-[14px] bg-muted px-3.5 py-2.5 text-[13px] font-semibold text-muted-foreground">
            {t("limitation")}
          </p>
          <ol className="space-y-2">
            {lines.map((line, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-2 w-6 shrink-0 text-right text-[13px] font-extrabold text-muted-foreground tabular-nums"
                >
                  {i + 1}
                </span>
                <Textarea
                  value={line}
                  onChange={(e) => setLine(i, e.target.value)}
                  rows={Math.min(3, Math.ceil(line.length / 80) || 1)}
                  aria-label={`${t("preview", { count: lines.length })} ${i + 1}`}
                  className="min-h-0 flex-1 rounded-xl text-[14.5px]"
                />
                <div className="flex shrink-0 gap-0.5 pt-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("addRow")}
                    title={t("addRow")}
                    onClick={() => addLine(i)}
                  >
                    <Plus aria-hidden className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("split")}
                    title={t("split")}
                    disabled={splitSentences(line).length < 2}
                    onClick={() => splitLine(i)}
                  >
                    <Scissors aria-hidden className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("merge")}
                    title={t("merge")}
                    disabled={i >= lines.length - 1}
                    onClick={() => mergeDown(i)}
                  >
                    <Merge aria-hidden className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={tc("delete")}
                    title={tc("delete")}
                    onClick={() => removeLine(i)}
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            <Button
              onClick={save}
              disabled={pending || nonEmptyCount === 0}
              title={nonEmptyCount === 0 ? te("noSentences") : undefined}
              className="rounded-[14px]"
            >
              {pending
                ? tc("saving")
                : t("add", { count: nonEmptyCount })}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={reset}>
              <X aria-hidden className="size-4" />
              {t("clear")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
