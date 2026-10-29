"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { ToggleButton } from "@wakii/ui-kit"

// Adapter @wakii/ui-kit (ToggleButton) — API shadcn giữ nguyên (pressed/
// onPressedChange/variant/size). Selector active đổi từ data-[state=on] (radix)
// sang aria-pressed (wakii set aria-pressed, không có data-state).
const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-accent aria-pressed:text-accent-foreground dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-9 min-w-9 px-2",
        sm: "h-8 min-w-8 px-1.5",
        lg: "h-10 min-w-10 px-2.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ToggleProps = VariantProps<typeof toggleVariants> & {
  pressed?: boolean
  defaultPressed?: boolean
  onPressedChange?: (pressed: boolean) => void
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}

function Toggle({
  className,
  variant,
  size,
  pressed,
  defaultPressed = false,
  onPressedChange,
  disabled,
  style,
  children,
}: ToggleProps) {
  const [internalPressed, setInternalPressed] = React.useState(defaultPressed)
  const isControlled = pressed !== undefined
  const checked = isControlled ? pressed : internalPressed

  return (
    <ToggleButton
      checked={checked}
      disabled={disabled}
      onChange={(next) => {
        if (!isControlled) setInternalPressed(next)
        onPressedChange?.(next)
      }}
      className={cn(toggleVariants({ variant, size }), className)}
      style={style}
    >
      {children}
    </ToggleButton>
  )
}

export { Toggle, toggleVariants }
