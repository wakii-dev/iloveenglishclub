"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"
import { Tag } from "@wakii/ui-kit"

/**
 * Adapter shadcn Badge → wakii Tag (@wakii/ui-kit 2.0.2).
 * wakii Badge là status-dot/count (variant todo/doing/done…) — KHÔNG khớp pill
 * variant shadcn (default/secondary/destructive/outline/ghost/link); Tag là pill
 * đúng shape, màu variant ghép bằng utility ilec (đăng ký sau ui-kit.css → thắng
 * bg/border mặc định của Tag). Call site chỉ dùng variant+className (đã audit)
 * nên các span prop còn lại không cần passthrough DOM.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const VARIANT_CLASSES: Record<
  NonNullable<VariantProps<typeof badgeVariants>["variant"]>,
  string
> = {
  default: "bg-primary text-primary-foreground border-transparent",
  secondary: "bg-secondary text-secondary-foreground border-transparent",
  destructive: "bg-destructive text-white border-transparent",
  outline: "border-border bg-transparent text-foreground",
  ghost: "border-transparent bg-transparent text-foreground",
  link: "border-transparent bg-transparent text-primary underline underline-offset-4",
}

function Badge({
  className,
  variant = "default",
  asChild = false,
  children,
  style,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="badge"
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      >
        {children}
      </Slot.Root>
    )
  }
  return (
    <Tag
      className={cn(VARIANT_CLASSES[variant ?? "default"], className)}
      style={style}
    >
      {children ?? null}
    </Tag>
  )
}

export { Badge, badgeVariants }
