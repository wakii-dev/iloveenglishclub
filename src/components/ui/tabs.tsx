"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Tabs as WakiiTabs } from "@wakii/ui-kit"

/**
 * Adapter shadcn Tabs → wakii Tabs (@wakii/ui-kit 2.0.2) — ilec PHẦN D.
 * Export names/props giữ nguyên 100% — internals chạy wakii Tabs (items-driven:
 * tablist role=tab/tabpanel + roving tabindex + ArrowLeft/Right/Home/End
 * built-in; chỉ render panel tab active — khớp hành vi Radix mặc định).
 * - Tabs (Root) nhặt TabsTrigger (trong TabsList, 1 tầng Fragment) +
 *   TabsContent khỏi children → build `items[]` (key/label/children/disabled)
 *   feed wakii.
 * - Controlled `value` → `activeKey`, `onValueChange` → `onChange`.
 *   Uncontrolled: tự giữ state nội bộ init từ `defaultValue` (wakii không có
 *   defaultActiveKey — không có state này thì keo lại items[0] mãi).
 * - Wakii không có đối tác → note:
 *   + `orientation="vertical"`: wakii chỉ tab bar ngang → bỏ qua.
 *   + TabsList `variant` (default|line): visual line-style shadcn không map
 *     được → bỏ qua (luôn look wakii: border-b + gạch accent).
 *   + className per-TabsTrigger: wakii chỉ có slot `tab` chung → bỏ qua.
 *   + `forceMount` trên TabsContent: wakii unmount panel ẩn → bỏ qua.
 *   + Composition lệch chuẩn (Trigger ngoài TabsList vẫn nhặt được qua Fragment;
 *     sâu hơn 2 tầng thì fallback render trần, không có chuyển tab).
 */

function Tabs({
  value: valueProp,
  defaultValue,
  onValueChange,
  className,
  children,
}: React.ComponentProps<"div"> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  orientation?: "horizontal" | "vertical"
}) {
  // Nhặt trigger/content — trigger nằm trong TabsList hoặc trực tiếp/Fragment.
  const triggers: {
    value: string
    label: React.ReactNode
    disabled?: boolean
  }[] = []
  const contents = new Map<string, React.ReactNode>()
  const scan = (nodes: React.ReactNode, depth: number) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return
      if (child.type === TabsTrigger) {
        const el = child as React.ReactElement<{
          value: string
          children?: React.ReactNode
          disabled?: boolean
        }>
        triggers.push({
          value: el.props.value,
          label: el.props.children,
          disabled: el.props.disabled,
        })
      } else if (child.type === TabsContent) {
        const el = child as React.ReactElement<{
          value: string
          children?: React.ReactNode
        }>
        contents.set(el.props.value, el.props.children)
      } else if (
        (child.type === TabsList || child.type === React.Fragment) &&
        depth < 2
      ) {
        const el = child as React.ReactElement<{ children?: React.ReactNode }>
        scan(el.props.children, depth + 1)
      }
    })
  }
  scan(children, 0)
  const items = triggers.map((t) => ({
    key: t.value,
    label: t.label,
    disabled: t.disabled,
    children: contents.get(t.value),
  }))

  const [innerValue, setInnerValue] = React.useState(defaultValue)
  const isControlled = valueProp !== undefined
  const value = isControlled ? valueProp : innerValue
  const handleChange = (key: string) => {
    if (!isControlled) setInnerValue(key)
    onValueChange?.(key)
  }

  return (
    <WakiiTabs
      items={items}
      activeKey={value}
      onChange={handleChange}
      className={className}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof tabsListVariants>) {
  // Bình thường được Tabs nhặt; bản fallback cho dùng lệch composition.
  return (
    <div
      role="tablist"
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
    </div>
  )
}

function TabsTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { value: string }) {
  // Bình thường được Tabs nhặt vào items[]; bản fallback cho dùng lệch
  // composition (không có chuyển tab).
  return (
    <button
      type="button"
      role="tab"
      data-slot="tabs-trigger"
      className={className}
      {...props}
    >
      {children}
    </button>
  )
}

function TabsContent({
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { value: string }) {
  // Bình thường được Tabs nhặt vào items[]; bản fallback cho dùng lệch.
  return (
    <div
      role="tabpanel"
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
