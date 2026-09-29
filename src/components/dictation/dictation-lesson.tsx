"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSession, useSession } from "next-auth/react";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  averageAccuracyOfDone,
  dictationStore,
  lessonProgress,
  SPEEDS,
  useDictationStore,
} from "@/lib/dictation/store";
import { clampSeek } from "@/lib/dictation-ui/format";
import { readRelaxedMode, updateRelaxedMode } from "@/lib/actions/relaxed-mode";
import { submitAttempt } from "@/lib/actions/submit-attempt";
import { attemptIdFor } from "@/lib/gamification/attempt-key";
import { notifyStatsUpdated } from "@/lib/gamification/events";
import {
  hasPendingAttempts,
  savePendingAttempts,
  takePendingAttempts,
  type PendingAttempt,
} from "@/lib/gamification/pending-commit";
import { StartGate } from "./start-gate";
import { SentenceDots } from "./sentence-dots";
import { DictationPlayer } from "./dictation-player";
import { TypePanel } from "./type-panel";
import { WordDiffDisplay } from "./word-diff-display";
import { HintStrip } from "./hint-strip";
import { LessonActions } from "./lesson-actions";
import { PartNav } from "./part-nav";
import { ProgressBar } from "./progress-bar";
import { TranscriptTab } from "./transcript-tab";
import { ShortcutsPanel } from "./shortcuts-panel";
import { ResultsScreen } from "./results-screen";
import { RelaxedToggle } from "./relaxed-toggle";
import { LoginBanner } from "./login-banner";
import { XpChip } from "./xp-chip";

/** Key dedup submit: (partId, text, relaxed, hint) — khớp attemptIdFor. */
const submitKey = (
  partId: number,
  text: string,
  relaxed: boolean,
  hint: boolean,
) => `${partId} ${text} ${relaxed ? 1 : 0} ${hint ? 1 : 0}`;

export interface DictationLessonProps {
  bookTitle: string;
  unitTitle: string;
  lessonTitle: string;
  cefrLabel: string;
  unitNumber: number;
  parts: readonly {
    id: number;
    text: string;
    audioUrl: string | null;
    durationMs: number | null;
  }[];
  nextHref: string | null;
  unitHref: string;
}

type TabKey = "dictation" | "transcript";

/**
 * Orchestrator DUY NHẤT của route (spec §2): mọi state machine qua store SF-3;
 * main <audio> element sống ở đây — src/currentTime/play/pause chỉ driven ở
 * sync effect DUY NHẤT (spec §3.2: deps [isPlaying, mediaNonce, audioUrl] +
 * appliedNonceRef consume-once, vì store KHÔNG bump nonce khi play/pause và
 * KHÔNG clear seekRequest).
 */
export function DictationLesson({
  bookTitle,
  unitTitle,
  lessonTitle,
  cefrLabel,
  unitNumber,
  parts,
  nextHref,
  unitHref,
}: DictationLessonProps) {
  const t = useTranslations("lesson");
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const pathname = usePathname();

  const phase = useDictationStore((s) => s.phase);
  const currentPartIndex = useDictationStore((s) => s.currentPartIndex);
  const input = useDictationStore((s) => s.input);
  const relaxed = useDictationStore((s) => s.relaxed);
  const speed = useDictationStore((s) => s.speed);
  const isPlaying = useDictationStore((s) => s.isPlaying);
  const mediaNonce = useDictationStore((s) => s.mediaNonce);
  const earnedXp = useDictationStore((s) => s.earnedXp);
  // partsState: identity đổi khi patchCurrent (check/hint/skip/next) → render
  // đúng lúc; keystroke (setInput) KHÔNG patch parts nên không re-render thừa.
  const partsState = useDictationStore((s) => s.parts);
  // Part object identity ổn định giữa các patch — selector object OK với useStore
  const currentPart = useDictationStore((s) => s.parts[s.currentPartIndex]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const appliedNonceRef = useRef(0);
  const appliedSrcRef = useRef<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioEnded, setAudioEnded] = useState(false);
  // duration LIVE từ audio element (loadedmetadata) — ưu tiên trước DB
  // (spec §7: audio.duration hợp lệ → dùng; không → durationMs DB)
  const [liveDurationMs, setLiveDurationMs] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("dictation");
  const activeTabRef = useRef<TabKey>("dictation");
  activeTabRef.current = activeTab;

  const audioUrl =
    currentPartIndex >= 0 && currentPartIndex < parts.length
      ? (parts[currentPartIndex]?.audioUrl ?? null)
      : null;
  const durationMs =
    liveDurationMs ??
    parts[currentPartIndex]?.durationMs ??
    null;

  // ─── Relaxed mode: đọc pref user đã login MỘT lần / mount (spec §3.8).
  // null = chưa biết (fetch dang dở) — doStart await rồi mới decide. ───
  const relaxedPrefRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    readRelaxedMode()
      .then((v) => {
        if (!cancelled) relaxedPrefRef.current = v === true;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ─── Sync effect DUY NHẤT main audio (spec §3.2) ───
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioUrl) {
      if (appliedSrcRef.current !== audioUrl) {
        appliedSrcRef.current = audioUrl;
        audio.src = audioUrl;
        audio.load();
        setAudioEnded(false); // part mới — icon về Play (P1 review: ended kẹt)
        setLiveDurationMs(null); // chờ loadedmetadata của src mới
      }
    } else {
      appliedSrcRef.current = null;
      audio.removeAttribute("src");
    }
    const sr = dictationStore.getState().seekRequest;
    if (sr && sr.nonce !== appliedNonceRef.current) {
      appliedNonceRef.current = sr.nonce;
      if (Math.abs(audio.currentTime * 1000 - sr.ms) > 30) {
        audio.currentTime = sr.ms / 1000;
      } else if (sr.ms === 0 && audio.ended) {
        // replay khi ended: currentTime đã 0 sau load mới — force seeked
        audio.currentTime = 0;
      }
    }
    if (isPlaying && audioUrl) {
      audio.play().catch(() => {}); // autoplay chặn → im lặng, nút play luôn sẵn
    } else {
      audio.pause();
    }
  }, [isPlaying, mediaNonce, audioUrl]);

  // PlaybackRate theo speed (sau load mới cũng phải set lại)
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = speed;
  }, [speed, audioUrl]);

  // ─── Elapsed/ended: listeners gắn MỘT lần (element tĩnh) ───
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setElapsedMs(audio.currentTime * 1000);
    const onLoaded = () =>
      setLiveDurationMs(
        Number.isFinite(audio.duration) ? audio.duration * 1000 : null,
      );
    const onEnded = () => {
      setAudioEnded(true);
      // functional update — tránh stale closure (P2 review)
      setElapsedMs((prev) =>
        Number.isFinite(audio.duration) ? audio.duration * 1000 : prev,
      );
    };
    const onSeeked = () => {
      setElapsedMs(audio.currentTime * 1000);
      setAudioEnded(false);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("seeked", onSeeked);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("seeked", onSeeked);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  // ─── Reset store khi rời route: BỎ (SF-6 guest-commit — state in-memory
  // phải SỐNG SÓT qua client-nav login giữa chừng; stale giữa 2 lesson vẫn
  // được chặn bởi doStart() reset trước khi nạp parts) ───
  useEffect(
    () => () => {
      if (relaxedFailTimer.current) clearTimeout(relaxedFailTimer.current);
    },
    [],
  );

  // ─── P0 review-fix: store singleton sống qua client-nav — khi mount một
  // lesson KHÁC, effect submit/mirror bên dưới đọc getState() theo INDEX và
  // map sang partId của lesson mới → ghost-submit (text A × part B, XP sai).
  // Reset theo SIGNATURE (transcript) — cùng lesson (login giữa chừng quay
  // lại) → giữ state để guest-commit; khác lesson → reset sạch. Effect này
  // KHAI BÁO TRƯỚC các effect submit/mirror (thứ tự chạy = thứ tự khai báo).
  // Bỏ unmount-reset (T6) vẫn đúng: đây là điểm reset duy nhất cần thiết. ───
  useEffect(() => {
    const s = dictationStore.getState();
    const sameLesson =
      s.parts.length === 0 ||
      (s.parts.length === parts.length &&
        s.parts.every((p, i) => p.transcript === parts[i]?.text));
    if (!sameLesson) dictationStore.getState().reset();
  }, [parts]);

  // ─── SF-6 persist (context pack #8): user đã login → mỗi check submit
  // server (recompute phía server). Cùng effect phủ cả guest login giữa
  // chừng qua client-nav (§5.8): khi user xuất hiện, parts có attempts từ
  // session guest được commit theo — attemptIdFor cho CÙNG id nên idempotent. ───
  const userId = user?.id ?? null;
  const sentSubmitsRef = useRef(new Set<string>());
  const submitOne = (partId: number, text: string, relaxed: boolean, hint: boolean) => {
    const key = submitKey(partId, text, relaxed, hint);
    if (sentSubmitsRef.current.has(key)) return;
    sentSubmitsRef.current.add(key); // add ĐỒNG BỘ trước await — chặn fire kép
    submitAttempt({
      partId,
      typedText: text,
      usedHint: hint,
      clientAttemptId: attemptIdFor(partId, text, relaxed, hint),
    })
      .then((r) => {
        if (r?.ok) {
          notifyStatsUpdated();
        } else {
          // lỗi server (mạng/validate) → mở khóa để submit lại ở lần
          // partsState kế; không phá flow học
          sentSubmitsRef.current.delete(key);
          console.error("[dictation] submit rejected:", r?.error);
        }
      })
      .catch((e) => {
        sentSubmitsRef.current.delete(key);
        console.error("[dictation] submit failed:", e);
      });
  };
  useEffect(() => {
    if (!userId) return;
    const s = dictationStore.getState();
    s.parts.forEach((part, i) => {
      if (part.attempts === 0 || !part.lastDiff) return;
      const partId = parts[i]?.id;
      if (partId == null) return;
      submitOne(partId, part.typedText, s.relaxed, part.usedHint);
    });
    // parts: data tĩnh theo lesson (props không đổi giữa renders) — cho vào
    // deps sẽ chạy effect mỗi timeupdate (4x/s) vô ích; dedup set đã chống
    // submit kép.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partsState, userId]);

  // ─── SF-6 guest-commit FULL-RELOAD leg (§5.8): login redirect về lesson là
  // hard nav → store chết. Guest: mirror kết quả in-memory vào sessionStorage
  // liên tục; user quay lại (mount, store idle): commit snapshot rồi xóa.
  // Trùng snapshot với đường client-nav → cùng attemptIdFor → idempotent. ───
  useEffect(() => {
    if (userId) return;
    const s = dictationStore.getState();
    const pend: PendingAttempt[] = [];
    s.parts.forEach((part, i) => {
      if (part.attempts === 0) return;
      const partId = parts[i]?.id;
      if (partId == null) return;
      pend.push({
        partId,
        typedText: part.typedText,
        usedHint: part.usedHint,
        relaxed: s.relaxed,
      });
    });
    if (pend.length > 0) savePendingAttempts(pend);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partsState, userId]);

  useEffect(() => {
    if (!userId) return;
    const pend = takePendingAttempts();
    if (pend.length === 0) return;
    pend.forEach((p) => submitOne(p.partId, p.typedText, p.relaxed, p.usedHint));
  }, [userId]);

  // ─── Session stale sau login SOFT-nav (§5.8): redirect về lesson bằng RSC
  // redirect → SessionProvider giữ session cũ (guest), header layout không
  // remount → không tự refetch. Có snapshot trong tay = user vừa login quay
  // lại → fetch session chủ động; provider cập nhật → userId flip → commit
  // effect chạy + header hiện user/XP. Guest thường (không snapshot) không
  // bị đụng. ───
  useEffect(() => {
    if (userId) return;
    if (hasPendingAttempts()) {
      void getSession().catch(() => {});
    }
  }, [userId]);

  const doStart = async () => {
    // Chuỗi 1 click (spec §3.1): reset (Try-again từ complete) → nạp parts →
    // relaxed-sync (start-gate phase mở — idle guard chặn) → gesture start →
    // playing. Session/pref có thể chưa hydrate lúc click (closure user null)
    // → đọc live getSession(); pref null → await (sticky activation vẫn hợp
    // lệ cho play() sau await).
    dictationStore.getState().reset();
    appliedSrcRef.current = null; // 1-part lesson: start() không bump nonce —
    // buộc src load lại từ đầu, né audio kẹt cuối (review P2, side SF-4)
    dictationStore.getState().start(parts.map((p) => ({ transcript: p.text })));
    const sessionUser =
      user ?? ((await getSession())?.user ?? null);
    let pref = relaxedPrefRef.current;
    if (sessionUser && pref === null) {
      pref = await readRelaxedMode().catch(() => null);
      relaxedPrefRef.current = pref === true;
    }
    if (sessionUser && pref && !dictationStore.getState().relaxed) {
      dictationStore.getState().toggleRelaxed();
    }
    dictationStore.getState().start();
  };

  /** Toggle relaxed: store ngay (optimistic) + prefRef + persist nếu user.
   *  Persist fail → log + note tạm (không Toaster — infra ngoài scope). */
  const [relaxedSaveFailed, setRelaxedSaveFailed] = useState(false);
  const relaxedFailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleToggleRelaxed = () => {
    dictationStore.getState().toggleRelaxed();
    const next = dictationStore.getState().relaxed;
    relaxedPrefRef.current = next;
    if (user) {
      updateRelaxedMode(next)
        .then((r) => {
          if (!r?.ok) {
            console.error("[dictation] relaxed persist rejected (ok:false)");
            setRelaxedSaveFailed(true);
            if (relaxedFailTimer.current)
              clearTimeout(relaxedFailTimer.current);
            relaxedFailTimer.current = setTimeout(
              () => setRelaxedSaveFailed(false),
              4000,
            );
          }
        })
        .catch((e) => console.error("[dictation] relaxed persist failed:", e));
    }
  };

  /** Enter theo (attempts, allCorrect) — KHÔNG phụ thuộc phase (spec §3.3). */
  const enterAction = () => {
    const s = dictationStore.getState();
    const part = s.parts[s.currentPartIndex];
    if (!part || part.status !== "pending") return;
    if (part.attempts === 0) s.check();
    else if (part.lastDiff?.allCorrect) s.next();
    else s.check();
  };

  const doSeekMs = (ms: number) => {
    const audioDur = audioRef.current?.duration;
    const dur =
      durationMs ??
      (audioDur && Number.isFinite(audioDur) ? audioDur * 1000 : 0);
    dictationStore.getState().seek(clampSeek(ms, dur));
  };

  // ─── Shortcuts (spec §3.6) — subscribe 1 lần, đọc getState() live ───
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = dictationStore.getState();
      const active =
        (s.phase === "playing" || s.phase === "input" || s.phase === "checked") &&
        activeTabRef.current === "dictation";
      if (!active) return;
      const part = s.parts[s.currentPartIndex];
      const frozen = !part || part.status !== "pending";
      if (e.key === "Tab") {
        e.preventDefault(); // spec §5: Tab = replay trong exercise (a11y: review M6)
        s.replay();
      } else if (e.key === "Escape") {
        s.pause();
      } else if (
        e.ctrlKey &&
        e.shiftKey &&
        (e.code === "Slash" || e.key === "?" || e.key === "/")
      ) {
        e.preventDefault();
        if (!frozen) s.hint();
      } else if (
        (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        const cur = audioRef.current?.currentTime
          ? audioRef.current.currentTime * 1000
          : 0;
        doSeekMs(cur + (e.key === "ArrowLeft" ? -3000 : 3000));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = parts.length;
  const currentNo = currentPartIndex + 1;
  const frozen = !currentPart || currentPart.status !== "pending";

  const dictationPane = (
    <div className="mx-auto max-w-[820px] px-6 pb-14">
      <nav
        aria-label={t("dictation.breadcrumb.aria")}
        className="flex flex-wrap items-center gap-1.5 pt-6 text-[13.5px] font-bold text-muted-foreground"
      >
        <Link
          href="/books"
          className="transition-colors hover:text-primary"
        >
          {bookTitle}
        </Link>
        <span aria-hidden className="text-muted-foreground/60">/</span>
        <span>{unitTitle}</span>
        <span aria-hidden className="text-muted-foreground/60">/</span>
        <b className="text-primary">{lessonTitle}</b>
      </nav>

      <SentenceDots
        statuses={partsState.map((p) => p.status)}
        currentIndex={currentPartIndex}
      />

      <div className="mb-3.5 flex items-center gap-2">
        <div className="flex gap-2">
          {(["dictation", "transcript"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              aria-pressed={activeTab === key}
              className={
                activeTab === key
                  ? "rounded-[14px] border-2 border-muted-foreground bg-card px-4 py-2 text-[13.5px] font-extrabold"
                  : "rounded-[14px] border-2 border-border bg-card px-4 py-2 text-[13.5px] font-extrabold text-muted-foreground transition-colors duration-150 hover:border-muted-foreground hover:text-foreground"
              }
            >
              {key === "dictation"
                ? t("dictation.tabs.dictation")
                : t("dictation.tabs.transcript")}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ShortcutsPanel />
          <div className="relative">
            <RelaxedToggle relaxed={relaxed} onToggle={handleToggleRelaxed} />
            {relaxedSaveFailed ? (
              <span
                role="status"
                className="absolute -bottom-6 right-0 whitespace-nowrap rounded-full bg-destructive px-2.5 py-0.5 text-[11.5px] font-extrabold text-destructive-foreground"
              >
                {t("dictation.relaxed.saveFailed")}
              </span>
            ) : null}
          </div>
          <XpChip earnedXp={earnedXp} isGuest={!user} />
          <span className="text-[13.5px] font-extrabold text-muted-foreground tabular-nums">
            {t("dictation.tabs.partLabel", { current: currentNo, total })}
          </span>
        </div>
      </div>

      {activeTab === "transcript" ? (
        <TranscriptTab
          sentences={parts.map((p, i) => ({
            text: p.text,
            status: partsState[i]?.status ?? "pending",
          }))}
          audioUrls={parts.map((p) => p.audioUrl)}
        />
      ) : (
        <>
          <div className="worksheet rounded-[24px] border-2 border-border bg-card p-[26px] pb-6 shadow-[0_10px_30px_-18px_color-mix(in_srgb,var(--primary-deep)_35%,transparent)]">
            <DictationPlayer
              isPlaying={isPlaying}
              ended={audioEnded}
              elapsedMs={elapsedMs}
              durationMs={durationMs}
              speed={speed}
              disabled={!audioUrl}
              onPlayPause={() => {
                if (audioEnded) dictationStore.getState().replay();
                else if (isPlaying) dictationStore.getState().pause();
                else dictationStore.getState().play();
              }}
              onSeekMs={doSeekMs}
              onSpeedCycle={() => {
                const idx = SPEEDS.indexOf(
                  speed as (typeof SPEEDS)[number],
                );
                dictationStore
                  .getState()
                  .setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]!);
              }}
            />

            <HintStrip
              transcript={currentPart?.transcript ?? ""}
              revealedIndices={currentPart?.revealedIndices ?? []}
              usedHint={currentPart?.usedHint ?? false}
            />

            <TypePanel
              value={input}
              onChange={(v) => dictationStore.getState().setInput(v)}
              onEnter={enterAction}
              readOnly={frozen}
            />

            {currentPart && currentPart.attempts > 0 && currentPart.lastDiff ? (
              <WordDiffDisplay diff={currentPart.lastDiff} relaxed={relaxed} />
            ) : null}

            <LessonActions
              attempts={currentPart?.attempts ?? 0}
              frozen={frozen}
              canHint={
                // Hint TRƯỚC check đầu hợp lệ (store tính diff tươi từ input);
                // sau check: còn từ chưa đúng mới hint được.
                !frozen &&
                (currentPart?.lastDiff
                  ? currentPart.lastDiff.firstIncorrectIndex != null
                  : true)
              }
              onCheck={() => dictationStore.getState().check()}
              onNext={() => dictationStore.getState().next()}
              onSkip={() => dictationStore.getState().skip()}
              onHint={() => dictationStore.getState().hint()}
            />
          </div>

          {!user ? <LoginBanner className="mt-4" nextHref={pathname} /> : null}

          <div className="mt-7">
            <ProgressBar
              done={lessonProgress({ parts: partsState }).done}
              total={total}
            />
            <PartNav
              current={currentNo}
              total={total}
              canPrev={currentPartIndex > 0}
              canNext={currentPart?.status !== "pending"}
              onPrev={() => dictationStore.getState().prevPart()}
              onNext={() => dictationStore.getState().next()}
            />
          </div>
        </>
      )}

    </div>
  );

  // ─── Render: content theo phase; <audio> VÔ ĐIỀU KIỆN ngoài cùng —
  // listeners effect chạy 1 lần lúc mount nên element phải tồn tại từ đầu
  // (bug T2: element trong nhánh phase → ref null → timeupdate không attach).
  let content: React.ReactNode;
  if (phase === "idle" || phase === "start-gate") {
    content = (
      <StartGate
        eyebrow={`${cefrLabel} · Unit ${unitNumber} — ${unitTitle}`}
        title={lessonTitle}
        facts={parts.map((p) => ({ durationMs: p.durationMs }))}
        onReadyToStart={doStart}
      />
    );
  } else if (phase === "complete") {
    content = (
      <ResultsScreen
        name={user?.name ?? null}
        eyebrow={`${bookTitle} · ${unitTitle}`}
        isGuest={!user}
        accuracy={averageAccuracyOfDone(partsState)}
        earnedXp={earnedXp}
        done={lessonProgress({ parts: partsState }).done}
        skipped={lessonProgress({ parts: partsState }).skipped}
        reviewWords={[
          ...new Set(
            partsState
              .filter((p) => p.status === "skipped" && p.lastDiff)
              .flatMap((p) =>
                p.lastDiff!.words
                  .filter(
                    (w) =>
                      (w.status === "wrong" || w.status === "missing") &&
                      w.transcriptToken,
                  )
                  .map((w) => w.transcriptToken!),
              ),
          ),
        ].slice(0, 6)}
        nextHref={nextHref}
        unitHref={unitHref}
        onTryAgain={doStart}
      />
    );
  } else {
    content = dictationPane;
  }

  return (
    <>
      {content}
      {/* Main audio — src/currentTime/play/pause chỉ driven ở sync effect trên */}
      <audio ref={audioRef} preload="auto" className="hidden" />
      {parts[currentPartIndex + 1]?.audioUrl ? (
        <audio
          preload="auto"
          src={parts[currentPartIndex + 1]!.audioUrl!}
          className="hidden"
        />
      ) : null}
    </>
  );
}
