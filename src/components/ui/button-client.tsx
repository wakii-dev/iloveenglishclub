"use client"

import * as React from "react"
import { cn } from "cn"
import { type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { Button as WakiiButton } from "@wakii/ui-kit"
import {
  buttonVariants,
  type ButtonSize,
  type ButtonVariant,
} from "./button-variants"

/**
 * Adapter shadcn Button → wakii Button (@wakii/ui-kit 2.0.2) — phần CLIENT.
 * (button.tsx là hub re-export server-safe cho buttonVariants.)
 * - variant shadcn → wakii `type` (primary|default|text + danger): default→primary
 *   (nền accent=coral ilec qua UiKitProvider), ghost→text, destructive→primary+danger.
 * - size shadcn → wakii small|middle|large; icon* giữ square bằng w/px utility.
 * - `type` HTML của shadcn → wakii `htmlType` (wakii dùng `type` làm variant) —
 *   8+ call site `type="submit"` phải giữ hành vi submit form.
 * - asChild: wakii không hỗ trợ → Slot.Root + buttonVariants gốc (ilec tokens)
 *   cho các Button-as-Link (không đổi call site).
 */
type WakiiType = "primary" | "default" | "text"
const VARIANT_TO_WAKII: Record<
  ButtonVariant,
  { type: WakiiType; danger?: boolean; className?: string }
> = {
  default: { type: "primary" },
  destructive: { type: "primary", danger: true },
  outline: { type: "default" },
  // wakii không có variant "secondary đã tô" — giữ nền teal ilec bằng utility
  // (utilities ilec đăng ký sau ui-kit.css → thắng conflict bg/hover/bg-border).
  secondary: {
    type: "default",
    className:
      "bg-secondary text-secondary-foreground border-transparent hover:bg-secondary/80",
  },
  ghost: { type: "text" },
  link: {
    type: "text",
    className: "text-primary underline underline-offset-4 hover:bg-transparent",
  },
}

const SIZE_TO_WAKII: Record<
  ButtonSize,
  { size?: "small" | "middle" | "large"; className?: string }
> = {
  default: { size: "middle" },
  xs: { size: "small", className: "px-2 text-xs" },
  sm: { size: "small" },
  lg: { size: "large" },
  icon: { className: "w-9 px-0" },
  "icon-xs": { size: "small", className: "w-6 px-0" },
  "icon-sm": { size: "small", className: "w-8 px-0" },
  "icon-lg": { size: "large", className: "w-10 px-0" },
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
  const v = VARIANT_TO_WAKII[variant ?? "default"]
  const s = SIZE_TO_WAKII[size ?? "default"]
  return (
    <WakiiButton
      type={v.type}
      danger={v.danger}
      htmlType={type}
      size={s.size}
      className={cn(v.className, s.className, className)}
      {...props}
    />
  )
}

export { Button }
