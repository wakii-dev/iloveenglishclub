"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Merge,
  Plus,
  Scissors,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AdminPartRow } from "@/lib/admin/queries";
import { resolveAudioUrl } from "@/lib/storage";
import {
  deletePartAction,
  insertEmptyPartAction,
  mergePartDownAction,
  movePartAction,
  splitPartAction,
  updatePartTextAction,
  type PartActionState,
} from "@/lib/actions/admin/parts";

/**
 * Parts editor (spec §6.3): text inline-edit (blur→save nếu đổi), preview
 * player nghe thử (resolveAudioUrl — local driver serve /audio/...), RESTRICT
 * disable khi part có attempts (tooltip giải thích), move/split/merge/insert/
 * delete. Mọi op → server action (assertAdmin + revalidate nếu published) →
 * router.refresh().
 */
export function PartsEditor({ parts }: { parts: AdminPartRow[] }) {
  const t = useTranslations("admin.parts");
  const te = useTranslations("admin.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(op: () => Promise<PartActionState>) {
    startTransition(async () => {
      const result = await op();
      if (result?.error) {
        toast.error(te(result.error));
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-[18px] border-2 border-border bg-card p-5">
      <p className="font-display text-[17px] font-bold">{t("title")}</p>

      {parts.length === 0 ? (
        <p className="mt-3 rounded-[14px] border-2 border-dashed border-border p-6 text-center text-[14px] font-semibold text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {parts.map((part) => (
            <PartRow
              key={part.id}
              part={part}
              disabled={pending}
              labels={{ t, te }}
              onSave={(text) => run(() => updatePartTextAction(part.id, text))}
              onMove={(dir) => run(() => movePartAction(part.id, dir))}
              onSplit={() => run(() => splitPartAction(part.id))}
              onMerge={() => run(() => mergePartDownAction(part.id))}
              onInsert={() => run(() => insertEmptyPartAction(part.id))}
              onDelete={() => run(() => deletePartAction(part.id))}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function PartRow({
  part,
  disabled,
  labels,
  onSave,
  onMove,
  onSplit,
  onMerge,
  onInsert,
  onDelete,
}: {
  part: AdminPartRow;
  disabled: boolean;
  labels: { t: ReturnType<typeof useTranslations>; te: ReturnType<typeof useTranslations> };
  onSave: (text: string) => void;
  onMove: (dir: "up" | "down") => void;
  onSplit: () => void;
  onMerge: () => void;
  onInsert: () => void;
  onDelete: () => void;
}) {
  const { t, te } = labels;
  const [text, setText] = useState(part.text);
  const dirty = text.trim() !== part.text && text.trim() !== "";

  return (
    <li className="rounded-[14px] border border-border bg-muted/30 p-3.5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-display text-[13px] font-bold text-secondary tabular-nums"
        >
          {part.sortOrder}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              if (dirty) onSave(text);
            }}
            rows={Math.min(3, Math.ceil(text.length / 80) || 1)}
            aria-label={`${t("title")} ${part.sortOrder}`}
            className="min-h-0 rounded-xl border-input bg-card text-[14.5px]"
          />
          <div className="flex flex-wrap items-center gap-2">
            {part.audioPath ? (
              <>
                <Badge variant="secondary" className="rounded-full font-mono text-[11px]">
                  {part.audioPath.split("/").pop()}
                </Badge>
                {/* Preview player — nghe thử trước publish (spec hand-off) */}
                <audio
                  controls
                  preload="none"
                  src={resolveAudioUrl(part.audioPath)}
                  className="h-8 max-w-[280px]"
                />
              </>
            ) : (
              <Badge
                variant="outline"
                className="rounded-full border-dashed text-muted-foreground"
              >
                {t("unmapped")}
              </Badge>
            )}
            {part.attemptsCount > 0 ? (
              <Badge className="rounded-full tabular-nums">
                {t("attempts", { count: part.attemptsCount })}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-0.5">
          <div className="flex gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("moveUp")}
              title={t("moveUp")}
              disabled={disabled}
              onClick={() => onMove("up")}
            >
              <ChevronUp aria-hidden className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("moveDown")}
              title={t("moveDown")}
              disabled={disabled}
              onClick={() => onMove("down")}
            >
              <ChevronDown aria-hidden className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("split")}
              title={t("split")}
              disabled={disabled}
              onClick={onSplit}
            >
              <Scissors aria-hidden className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("merge")}
              title={t("merge")}
              disabled={disabled}
              onClick={onMerge}
            >
              <Merge aria-hidden className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("insertAfter")}
              title={t("insertAfter")}
              disabled={disabled}
              onClick={onInsert}
            >
              <Plus aria-hidden className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("remove")}
              title={
                part.attemptsCount > 0 ? t("attemptsTooltip") : t("remove")
              }
              disabled={disabled || part.attemptsCount > 0}
              onClick={() => {
                // double-guard UI: part có attempts không bao giờ tới đây
                if (part.attemptsCount > 0) {
                  toast.error(te("hasAttempts"));
                  return;
                }
                onDelete();
              }}
            >
              <Trash2 aria-hidden className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
