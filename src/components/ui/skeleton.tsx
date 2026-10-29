"use client"

import * as React from "react"
import { Skeleton as WakiiSkeleton } from "@wakii/ui-kit"

// Adapter (ilec PHẦN C): contract shadcn giữ nguyên (className trên div);
// internals → @wakii/ui-kit Skeleton (variant text/row/card/circle/button).
// wakii Skeleton chỉ nhận variant/count/className(s) — children/style/data-* bị
// drop (callers hiện tại chỉ dùng className). "use client" vì dist wakii
// không có banner. Đổi wakii thiếu gì thì giữ nguyên shadcn — Skeleton wakii có.
function Skeleton({ className }: React.ComponentProps<"div">) {
  return <WakiiSkeleton className={className} />
}

export { Skeleton }
