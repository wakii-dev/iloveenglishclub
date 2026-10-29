"use client"

import * as React from "react"
import { cn } from "cn"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"
import { Popover as WakiiPopover } from "@wakii/ui-kit"

/**
 * Adapter shadcn DropdownMenu → wakii Popover (@wakii/ui-kit 2.0.2) — ilec
 * PHẦN D. Export names/props giữ nguyên 100%.
 * - Engine mở/đóng + định vị: wakii `Popover` trigger="click" (ESC + click
 *   ngoài + controlled open/onOpenChange built-in). KHÔNG dùng wakii `Dropdown`
 *   vì API items-array — thiếu Label/checkbox/radio/sub/asChild mà callers cần.
 * - DropdownMenu nhặt DropdownMenuTrigger + DropdownMenuContent khỏi children
 *   (1 tầng Fragment) → feed Popover; item components giữ compound API shadcn,
 *   click item tự đóng menu qua context (hành vi Radix mặc định).
 * - Map: Content `side` → Popover `placement` (default bottom — same 4 giá trị).
 * - Wakii thiếu → tự làm local hoặc note:
 *   + align (start/center/end) + sideOffset: panel Popover luôn center dưới
 *     trigger, gap cố định 10px → bỏ qua (user-menu align="end" lệch nhẹ sang
 *     phải so với trước).
 *   + role=menu/menuitem tự gắn trên item components; panel wakii là
 *     role="dialog"; KHÔNG có arrow-key navigation như Radix (tab/ESC thôi).
 *   + Checkbox/Radio/Sub: làm local (không còn Radix) — sub menu mở bằng
 *     click, neo trái, không auto-flip.
 *   + Panel wakii không có max-h → thêm max-h-72 overflow-y-auto mặc định.
 */

type MenuContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const MenuContext = React.createContext<MenuContextValue>({
  open: false,
  setOpen: () => {},
})

function DropdownMenu({
  open: openProp,
  onOpenChange,
  defaultOpen = false,
  children,
}: React.ComponentProps<"div"> & {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
}) {
  const [innerOpen, setInnerOpen] = React.useState(defaultOpen)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : innerOpen
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInnerOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  // Nhặt Trigger + Content khỏi children (1 tầng Fragment).
  let trigger: React.ReactNode
  let contentExtract: {
    side?: "top" | "right" | "bottom" | "left"
    className?: string
    children?: React.ReactNode
  } = {}
  const scan = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return
      const el = child as React.ReactElement<{
        children?: React.ReactNode
        side?: "top" | "right" | "bottom" | "left"
        className?: string
      }>
      if (el.type === DropdownMenuTrigger) {
        trigger = el.props.children
      } else if (el.type === DropdownMenuContent) {
        contentExtract = {
          side: el.props.side,
          className: el.props.className,
          children: el.props.children,
        }
      } else if (el.type === React.Fragment) {
        scan(el.props.children)
      }
    })
  }
  scan(children)

  const triggerEl = React.isValidElement(trigger) ? (
    (trigger as React.ReactElement<Record<string, unknown>>)
  ) : (
    <button type="button" data-slot="dropdown-menu-trigger">
      {trigger}
    </button>
  )

  return (
    <MenuContext.Provider value={{ open, setOpen }}>
      <WakiiPopover
        trigger="click"
        open={open}
        onOpenChange={setOpen}
        placement={contentExtract.side ?? "bottom"}
        classNames={{
          panel: "p-1 min-w-[8rem] max-h-72 overflow-y-auto",
        }}
        content={
          <div
            role="menu"
            data-slot="dropdown-menu-content"
            className={cn("text-foreground", contentExtract.className)}
          >
            {contentExtract.children}
          </div>
        }
      >
        {triggerEl}
      </WakiiPopover>
    </MenuContext.Provider>
  )
}

function DropdownMenuTrigger({
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  // Bình thường được DropdownMenu nhặt; bản fallback cho dùng lệch composition.
  if (asChild && React.isValidElement(children)) {
    return children as React.ReactElement
  }
  return (
    <button type="button" data-slot="dropdown-menu-trigger" {...props}>
      {children}
    </button>
  )
}

function DropdownMenuPortal({ children }: { children?: React.ReactNode }) {
  // Popover wakii render inline (absolute trong root span) — passthrough.
  return <>{children}</>
}

function DropdownMenuContent({
  className,
  children,
}: React.ComponentProps<"div"> & {
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
  align?: "start" | "center" | "end"
  alignOffset?: number
}) {
  // Bình thường được DropdownMenu nhặt render vào panel Popover; bản fallback
  // này không có mở/đóng.
  return (
    <div
      role="menu"
      data-slot="dropdown-menu-content"
      className={cn("text-foreground", className)}
    >
      {children}
    </div>
  )
}

function DropdownMenuGroup({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="dropdown-menu-group"
      className={className}
      {...props}
    >
      {children}
    </div>
  )
}

const ITEM_BASE =
  "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  asChild = false,
  onClick,
  disabled,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean
  variant?: "default" | "destructive"
  asChild?: boolean
  disabled?: boolean
}) {
  const ctx = React.useContext(MenuContext)
  // Hành vi Radix: chọn item → đóng menu (trừ khi handler preventDefault).
  const closeOnSelect = (e: React.MouseEvent) => {
    if (!e.defaultPrevented && !disabled) ctx.setOpen(false)
  }
  const itemClassName = cn(
    ITEM_BASE,
    inset && "pl-8",
    variant === "destructive" &&
      "text-destructive hover:bg-destructive/10 hover:text-destructive",
    disabled && "pointer-events-none opacity-50",
    className
  )
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{
      onClick?: React.MouseEventHandler
      className?: string
    }>
    return React.cloneElement(child, {
      onClick: (e: React.MouseEvent) => {
        child.props.onClick?.(e)
        onClick?.(e as React.MouseEvent<HTMLDivElement>)
        closeOnSelect(e)
      },
      className: cn(itemClassName, child.props.className),
    })
  }
  return (
    <div
      role="menuitem"
      tabIndex={-1}
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      aria-disabled={disabled || undefined}
      data-disabled={disabled || undefined}
      className={itemClassName}
      onClick={(e) => {
        onClick?.(e)
        closeOnSelect(e)
      }}
      {...props}
    >
      {children}
    </div>
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  onCheckedChange,
  disabled,
  ...props
}: React.ComponentProps<"div"> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
}) {
  const ctx = React.useContext(MenuContext)
  return (
    <div
      role="menuitemcheckbox"
      aria-checked={checked ?? false}
      tabIndex={-1}
      data-slot="dropdown-menu-checkbox-item"
      aria-disabled={disabled || undefined}
      data-disabled={disabled || undefined}
      className={cn(
        ITEM_BASE,
        "py-1.5 pr-2 pl-8",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      onClick={() => {
        if (disabled) return
        onCheckedChange?.(!checked)
        ctx.setOpen(false)
      }}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        {checked && <CheckIcon className="size-4" />}
      </span>
      {children}
    </div>
  )
}

const RadioGroupContext = React.createContext<{
  value?: string
  onValueChange?: (value: string) => void
}>({})

function DropdownMenuRadioGroup({
  value,
  onValueChange,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  value?: string
  onValueChange?: (value: string) => void
}) {
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange }}>
      <div
        role="group"
        data-slot="dropdown-menu-radio-group"
        className={className}
        {...props}
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  value,
  disabled,
  ...props
}: React.ComponentProps<"div"> & {
  value: string
  disabled?: boolean
}) {
  const group = React.useContext(RadioGroupContext)
  const ctx = React.useContext(MenuContext)
  const checked = group.value === value
  return (
    <div
      role="menuitemradio"
      aria-checked={checked}
      tabIndex={-1}
      data-slot="dropdown-menu-radio-item"
      aria-disabled={disabled || undefined}
      data-disabled={disabled || undefined}
      className={cn(
        ITEM_BASE,
        "py-1.5 pr-2 pl-8",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      onClick={() => {
        if (disabled) return
        group.onValueChange?.(value)
        ctx.setOpen(false)
      }}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        {checked && <CircleIcon className="size-2 fill-current" />}
      </span>
      {children}
    </div>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean
}) {
  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn("px-2 py-1.5 text-sm font-medium data-[inset]:pl-8", className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      role="separator"
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

const SubContext = React.createContext<MenuContextValue>({
  open: false,
  setOpen: () => {},
})

function DropdownMenuSub({
  open: openProp,
  onOpenChange,
  defaultOpen = false,
  children,
}: React.ComponentProps<"div"> & {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
}) {
  const [innerOpen, setInnerOpen] = React.useState(defaultOpen)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : innerOpen
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInnerOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )
  return (
    <SubContext.Provider value={{ open, setOpen }}>
      {/* relative để SubContent anchor đúng vào sub này */}
      <div className="relative" data-slot="dropdown-menu-sub">
        {children}
      </div>
    </SubContext.Provider>
  )
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean
}) {
  const sub = React.useContext(SubContext)
  return (
    <div
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={sub.open}
      tabIndex={-1}
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(ITEM_BASE, inset && "pl-8", className)}
      onClick={() => sub.setOpen(!sub.open)}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </div>
  )
}

function DropdownMenuSubContent({
  className,
  children,
}: React.ComponentProps<"div"> & { sideOffset?: number }) {
  const sub = React.useContext(SubContext)
  if (!sub.open) return null
  return (
    <div
      role="menu"
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "absolute top-0 left-full z-50 ml-1 min-w-[8rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-lg",
        className
      )}
    >
      {children}
    </div>
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
