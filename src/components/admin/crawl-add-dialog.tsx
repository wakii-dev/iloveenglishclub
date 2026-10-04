"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Play, Plus, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, callApi, jsonInit } from "@/lib/admin/crawl-client";
import type { PreviewEntry, PreviewResult } from "@/lib/oxford/enrich";
import { resolveStoredAudioUrl } from "@/lib/admin/vocabulary";

/**
 * Crawl-on-add dialog (VU-32 SF-3, context pack §4) — gõ từ → POST
 * /api/admin/vocabulary/crawl/word (cache-first) → preview IPA/pos/audio →
 * teacher điền nghĩa VI (BẮT BUỘC — crawl không bao giờ sinh nghĩa, không
 * LLM) → approve POST /crawl/word/approve → từ vào book. Audio preview play
 * khi có blob (resolveStoredAudioUrl — blob CDN https nguyên vẹn).
 */

type ApproveResponse = {
  id: number;
  duplicate: boolean;
  audioAttached: boolean;
};

export function CrawlAddDialog({
  bookId,
  onAdded,
}: {
  bookId: number;
  onAdded: () => void;
}) {
  const t = useTranslations("admin.crawl");
  const tc = useTranslations("admin.common");
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookedUp, setLookedUp] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [meaning, setMeaning] = useState("");
  const [approving, setApproving] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const errorText = (error: unknown) => {
    const code = error instanceof ApiError ? error.code : "generic";
    return t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic");
  };

  function reset() {
    setWord("");
    setLooking(false);
    setLookedUp(false);
    setPreview(null);
    setMeaning("");
    setApproving(false);
    audioRef.current?.pause();
    audioRef.current = null;
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function lookup() {
    const term = word.trim();
    if (!term) return;
    audioRef.current?.pause();
    setLooking(true);
    setLookedUp(false);
    setPreview(null);
    try {
      const data = await callApi<PreviewResult>(
        "/api/admin/vocabulary/crawl/word",
        jsonInit("POST", { word: term }),
      );
      setPreview(data);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setLooking(false);
      setLookedUp(true);
    }
  }

  function playAudio(entry: PreviewEntry) {
    const url = entry.audioUkBlob ?? entry.audioUsBlob;
    if (!url) return;
    audioRef.current?.pause();
    const audio = new Audio(resolveStoredAudioUrl(url));
    audioRef.current = audio;
    audio.play().catch(() => toast.error(t("errors.generic")));
  }

  async function approve() {
    if (!preview?.found || preview.entry === null) return;
    setApproving(true);
    try {
      const data = await callApi<ApproveResponse>(
        "/api/admin/vocabulary/crawl/word/approve",
        jsonInit("POST", {
          entry: preview.entry,
          meaning_vi: meaning,
          bookId,
        }),
      );
      if (data.duplicate) {
        toast.info(t("add.duplicateNote"));
      } else {
        toast.success(
          `${t("add.created", { word: preview.entry.word })} ${
            data.audioAttached
              ? t("add.audioAttached")
              : t("add.noAudioAttached")
          }`,
        );
      }
      onAdded();
      close();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setApproving(false);
    }
  }

  const entry = preview?.found ? (preview.entry ?? null) : null;

  return (
    <>
      <Button className="rounded-[14px]" onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" />
        {t("add.open")}
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{t("add.title")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("add.title")}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookup();
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="crawl-add-word">{t("add.wordLabel")}</Label>
              <Input
                id="crawl-add-word"
                value={word}
                onChange={(e) => setWord(e.target.value)}
                placeholder={t("add.placeholder")}
                maxLength={100}
                autoComplete="off"
                required
              />
            </div>
            <Button type="submit" disabled={looking || !word.trim()}>
              {looking ? (
                <>
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  {t("add.looking")}
                </>
              ) : (
                t("add.lookup")
              )}
            </Button>
          </form>

          {lookedUp && !looking && preview !== null && !preview.found ? (
            <p className="text-[14px] font-semibold text-muted-foreground">
              {t("add.notFound")}
            </p>
          ) : null}

          {entry ? (
            <div className="space-y-3 rounded-[12px] bg-muted/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-[20px] font-bold">
                  {entry.word}
                </span>
                <Badge variant={preview?.from === "cache" ? "secondary" : "outline"}>
                  {preview?.from === "cache"
                    ? t("add.fromCache")
                    : t("add.fromLive")}
                </Badge>
                {entry.cefr ? <Badge variant="secondary">{entry.cefr}</Badge> : null}
              </div>
              <p className="font-mono text-[12.5px] text-muted-foreground">
                {entry.slug}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13.5px]">
                <div className="flex gap-2">
                  <dt className="font-bold text-muted-foreground">
                    {t("add.fieldIpaUk")}
                  </dt>
                  <dd className="font-mono">{entry.ipaUk ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-bold text-muted-foreground">
                    {t("add.fieldIpaUs")}
                  </dt>
                  <dd className="font-mono">{entry.ipaUs ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-bold text-muted-foreground">
                    {t("add.fieldPos")}
                  </dt>
                  <dd>{entry.pos ?? "—"}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-muted-foreground">
                    {entry.audioUkBlob || entry.audioUsBlob
                      ? t("add.hasAudio")
                      : t("add.noAudio")}
                  </span>
                  {entry.audioUkBlob || entry.audioUsBlob ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("add.hasAudio")}
                      onClick={() => playAudio(entry)}
                    >
                      <Volume2 aria-hidden className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </dl>

              <div className="space-y-1.5">
                <Label htmlFor="crawl-add-meaning">{t("add.meaningLabel")}</Label>
                <Textarea
                  id="crawl-add-meaning"
                  value={meaning}
                  onChange={(e) => setMeaning(e.target.value)}
                  rows={2}
                  maxLength={500}
                  required
                />
                <p className="text-[12px] text-muted-foreground">
                  {t("add.meaningHint")}
                </p>
              </div>

              <Button
                className="w-full rounded-[14px]"
                disabled={approving || meaning.trim().length === 0}
                onClick={() => void approve()}
              >
                {approving ? (
                  <>
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                    {t("add.approving")}
                  </>
                ) : (
                  <>
                    <Play aria-hidden className="size-4" />
                    {t("add.approve")}
                  </>
                )}
              </Button>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button variant="ghost" onClick={close}>
              {tc("cancel")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
