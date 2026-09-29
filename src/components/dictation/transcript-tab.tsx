"use client";

import type { PartStatus } from "@/lib/dictation/store";

interface Props {
  sentences: readonly { text: string; status: PartStatus }[];
}

/** STUB T1 → FULL T4: list câu — done hiện, pending blur + lock; Play all. */
export const TranscriptTab: React.FC<Props> = () => null;
