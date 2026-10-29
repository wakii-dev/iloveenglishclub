"use client"

import * as React from "react"
import { type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { ToggleButton, ToggleButtonGroup } from "@wakii/ui-kit"

import { toggleVariants } from "@/components/ui/toggle"

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number
  }
>({
  size: "default",
  variant: "default",
  spacing: 0,
})

type ToggleGroupProps = VariantProps<typeof toggleVariants> &
  (
    | {
        type?: "single"
        value?: string
        defaultValue?: string
        onValueChange?: (value: string) => void
      }
    | {
        type: "multiple"
        value?: string[]
        defaultValue?: string[]
        onValueChange?: (value: string[]) => void
      }
  ) & {
    spacing?: number
    disabled?: boolean
    className?: string
    style?: React.CSSProperties
    children?: React.ReactNode
  }

function ToggleGroup({
  variant = "default",
  size = "default",
  spacing = 0,
  disabled,
  className,
  style,
  children,
  ...props
}: ToggleGroupProps) {
  const multiple = props.type === "multiple"
  const [internal, setInternal] = React.useState<string | string[]>(
    props.defaultValue ?? (multiple ? [] : "")
  )
  const current = props.value ?? internal

  return (
    // Provider ĐỨNG NGOÀI wakii group — wakii cloneElement mọi child có
    // props.value, Context.Provider cũng mang value nên phải tách khỏi children.
    <ToggleGroupContext.Provider value={{ variant, size, spacing }}>
      <ToggleButtonGroup
        {...(props.type === "multiple"
          ? {
              multiple: true as const,
              value: current as string[],
              onChange: (next: string[]) => {
                setInternal(next)
                props.onValueChange?.(next)
              },
            }
          : {
              value: current as string,
              onChange: (next: string) => {
                // radix parity: single bấm nút đang chọn → bỏ chọn ("" như radix)
                const v = next === current ? "" : next
                setInternal(v)
                props.onValueChange?.(v)
              },
            })}
        disabled={disabled}
        className={cn("w-fit rounded-md", className)}
        style={{ gap: spacing, ...style }}
      >
        {children}
      </ToggleButtonGroup>
    </ToggleGroupContext.Provider>
  )
}

type ToggleGroupItemProps = VariantProps<typeof toggleVariants> & {
  value: string
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
  /** Injected bởi ToggleGroup (wakii cloneElement) — không truyền tay. */
  checked?: boolean
  onChange?: (checked: boolean) => void
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  value,
  disabled,
  style,
  checked,
  onChange,
}: ToggleGroupItemProps) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <ToggleButton
      value={value}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        // joined (spacing=0 — mặc định shadcn): nối liền khối, bo góc chỉ ở đầu/cuối
        "rounded-none shadow-none border-l-0 first:rounded-l-md first:border-l last:rounded-r-md",
        className
      )}
      style={style}
    >
      {children}
    </ToggleButton>
  )
}

export { ToggleGroup, ToggleGroupItem }
