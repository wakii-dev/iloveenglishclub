"use client";

import type { DiffResult } from "@/lib/dictation/diff";

interface Props {
  diff: DiffResult;
  relaxed: boolean;
}

/** STUB T1 → FULL T3: token xanh/đỏ + chip từ đúng + diff-note theo mode. */
export const WordDiffDisplay: React.FC<Props> = () => null;
