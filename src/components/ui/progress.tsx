"use client"

import * as React from "react"
import { Progress as WakiiProgress } from "@wakii/ui-kit"

// Adapter (ilec PHẦN C): contract shadcn (div props + value/max kiểu Radix) giữ
// nguyên; internals → @wakii/ui-kit Progress (percent 0–100, tokens wakii).
// LƯU Ý: wakii không render con [data-slot=progress-indicator] — selector
// `[&>[data-slot=progress-indicator]]:bg-secondary` ở
// src/app/(public)/[locale]/(home)/page.tsx:94 mất tác dụng (sửa ở page đó).
// Props div lạ (id/data-*/aria-*) bị drop — wakii chỉ nhận percent/style/classNames.
type ProgressProps = React.ComponentProps<"div"> & {
  value?: number | null
  max?: number
}

function Progress({ className, value, style, max }: ProgressProps) {
  const base = typeof max === "number" && max > 0 ? max : 100
  const percent =
    typeof value === "number" ? Math.max(0, Math.min(100, (value / base) * 100)) : 0
  return (
    <WakiiProgress
      className={className}
      style={style}
      percent={percent}
    />
  )
}

export { Progress }
