"use client"

import * as React from "react"
import { Tooltip as WakiiTooltip } from "@wakii/ui-kit"

/**
 * Adapter shadcn Tooltip → wakii Tooltip (@wakii/ui-kit 2.0.2) — ilec PHẦN D.
 * Export names/props giữ nguyên 100% — internals chạy wakii Tooltip
 * (hover/focus mở, auto-flip sát mép viewport, arrow + ESC + aria-describedby
 * built-in; bubble bọc trigger trong span relative).
 * - Tooltip (Root) nhặt TooltipTrigger + TooltipContent khỏi children (1 tầng
 *   Fragment): trigger element → wakii children, content → wakii `title`,
 *   Content `side` → `placement` (default top — same 4 giá trị), Content
 *   className → `classNames.bubble`.
 * - Wakii không có đối tác → note:
 *   + TooltipProvider: passthrough — delayDuration bị bỏ qua (wakii không có
 *     delay, bubble mở ngay khi hover/focus).
 *   + sideOffset/align/alignOffset: gap bubble cố định 8px, bubble luôn center
 *     theo trục placement → bỏ qua.
 *   + open/onOpenChange (controlled) + disableHoverableContent: wakii chỉ
 *     uncontrolled → bỏ qua.
 *   + Composition lệch chuẩn (Trigger/Content bọc trong div): Root không nhặt
 *     được → render fallback không bubble (Trigger vẫn hiện, Content rỗng).
 */

type TooltipSide = "top" | "right" | "bottom" | "left"

function Tooltip({ children }: { children?: React.ReactNode }) {
  let trigger: React.ReactNode
  let content: React.ReactNode
  let placement: TooltipSide = "top"
  let bubbleClassName: string | undefined
  const scan = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return
      const el = child as React.ReactElement<{
        children?: React.ReactNode
        side?: TooltipSide
        className?: string
      }>
      if (el.type === TooltipTrigger) {
        trigger = el.props.children
      } else if (el.type === TooltipContent) {
        content = el.props.children
        placement = el.props.side ?? "top"
        bubbleClassName = el.props.className
      } else if (el.type === React.Fragment) {
        scan(el.props.children)
      }
    })
  }
  scan(children)

  // Composition không chuẩn → render nguyên children (Content tự render null).
  if (trigger === undefined) return <>{children}</>

  const triggerEl = React.isValidElement(trigger) ? (
    (trigger as React.ReactElement<Record<string, unknown>>)
  ) : (
    <button type="button" data-slot="tooltip-trigger">
      {trigger}
    </button>
  )

  return (
    <WakiiTooltip
      title={content}
      placement={placement}
      classNames={bubbleClassName ? { bubble: bubbleClassName } : undefined}
    >
      {triggerEl}
    </WakiiTooltip>
  )
}

function TooltipTrigger({
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  // Bình thường được Tooltip nhặt; bản fallback cho dùng lệch composition.
  if (asChild && React.isValidElement(children)) {
    return children as React.ReactElement
  }
  return (
    <button type="button" data-slot="tooltip-trigger" {...props}>
      {children}
    </button>
  )
}

function TooltipContent({
  className,
  children,
}: React.ComponentProps<"div"> & {
  side?: TooltipSide
  sideOffset?: number
  align?: "start" | "center" | "end"
  alignOffset?: number
}) {
  // Bình thường được Tooltip nhặt vào bubble wakii; fallback (dùng lệch
  // composition) → không có nơi để neo bubble → render null.
  void className
  void children
  return null
}

function TooltipProvider({
  delayDuration,
  children,
}: {
  delayDuration?: number
  skipDelayDuration?: number
  children?: React.ReactNode
}) {
  // wakii không cần provider (không có delay) — passthrough giữ API.
  void delayDuration
  return <>{children}</>
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
