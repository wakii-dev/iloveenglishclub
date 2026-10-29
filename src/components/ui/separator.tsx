"use client"

import * as React from "react"
import { cn } from "cn"
import { Divider } from "@wakii/ui-kit"

/**
 * Adapter shadcn Separator → wakii Divider (@wakii/ui-kit 2.0.2).
 * orientation shadcn → `type` wakii; `decorative` bỏ qua (wakii divider luôn
 * decorative). Màu line ghép bg-border ilec (utilities ilec đến sau → thắng
 * --line2 mặc định của wakii). DividerProps wakii không có rest passthrough —
 * các prop radix khác không forward (chưa có call site, audit 0 dùng).
 */
function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical"
}) {
  void props
  const vertical = orientation === "vertical"
  return (
    <Divider
      type={vertical ? "vertical" : "horizontal"}
      className={cn(
        vertical ? "h-full w-px self-stretch bg-border" : "h-px w-full bg-border",
        className,
      )}
    />
  )
}

export { Separator }
