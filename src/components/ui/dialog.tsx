"use client"

import * as React from "react"
import { cn } from "cn"
import { Modal as WakiiModal } from "@wakii/ui-kit"

import { Button } from "@/components/ui/button"

/**
 * Adapter shadcn Dialog → wakii Modal (@wakii/ui-kit 2.0.2) — ilec PHẦN D.
 * Export names/props giữ nguyên 100% — internals chạy wakii Modal
 * (portal + focus trap + scroll lock + ESC/overlay/× cancel built-in).
 * - open/onOpenChange → Modal `open`/`onCancel` (đóng từ ESC, overlay, nút ×).
 * - DialogContent nhặt DialogTitle / DialogDescription / DialogFooter khỏi
 *   children (trực tiếp, hoặc bên trong DialogHeader / Fragment — 2 tầng) map
 *   vào Modal `title` / `classNames.header` / `footer`; phần còn lại = body.
 *   Không có DialogFooter → `footer={null}`: tắt hẳn hàng OK/Huỷ mặc định của
 *   Modal (shadcn không tự sinh footer — form submit nằm trong body).
 * - className của DialogContent → `classNames.wrapper` (panel Modal); kèm
 *   `sm:max-w-lg` mặc định shadcn (utilities ilec đăng ký sau ui-kit.css →
 *   thắng max-w-[416px] của wakii).
 * - showCloseButton=false → `classNames.closeButton="hidden"` (nút × wakii
 *   không có utility display mặc định nên `hidden` ăn chắc).
 * - Wakii không có đối tác → giữ hành vi cũ + note:
 *   + DialogOverlay: Modal có mask riêng → render null.
 *   + DialogPortal: passthrough (Modal tự portal vào document.body).
 *   + aria-describedby cho DialogDescription: wakii không wire — description
 *     vẫn render đầu body (sr-only vẫn ăn).
 *   + Callbacks Radix (onEscapeKeyDown, onInteractOutside…) không map được.
 * - Dùng ngoài `<Dialog>`: Modal luôn đóng (context mặc định open=false).
 */

type DialogContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextValue>({
  open: false,
  setOpen: () => {},
})

function Dialog({
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
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  )
}

function DialogTrigger({
  asChild = false,
  onClick,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const ctx = React.useContext(DialogContext)
  const open = () => ctx.setOpen(true)
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{
      onClick?: React.MouseEventHandler
    }>
    return React.cloneElement(child, {
      onClick: (e) => {
        child.props.onClick?.(e)
        onClick?.(e as React.MouseEvent<HTMLButtonElement>)
        open()
      },
    })
  }
  return (
    <button
      type="button"
      data-slot="dialog-trigger"
      onClick={(e) => {
        onClick?.(e)
        open()
      }}
      {...props}
    >
      {children}
    </button>
  )
}

function DialogClose({
  asChild = false,
  onClick,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const ctx = React.useContext(DialogContext)
  const close = () => ctx.setOpen(false)
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{
      onClick?: React.MouseEventHandler
    }>
    return React.cloneElement(child, {
      onClick: (e) => {
        child.props.onClick?.(e)
        onClick?.(e as React.MouseEvent<HTMLButtonElement>)
        close()
      },
    })
  }
  return (
    <button
      type="button"
      data-slot="dialog-close"
      onClick={(e) => {
        onClick?.(e)
        close()
      }}
      {...props}
    >
      {children}
    </button>
  )
}

function DialogPortal({ children }: { children?: React.ReactNode }) {
  // Modal tự portal — passthrough để composition cũ không vỡ.
  return <>{children}</>
}

function DialogOverlay({ className: _className }: { className?: string }) {
  // Modal có mask built-in (bg-[var(--mask)] + z-modal) — không render gì.
  void _className
  return null
}

/** Kết quả nhặt slot khỏi children của DialogContent. */
type ModalParts = {
  title: React.ReactNode
  titleClassName?: string
  description: React.ReactNode
  descriptionClassName?: string
  footer?: React.ReactElement
  body: React.ReactNode[]
}

function extractModalParts(nodes: React.ReactNode, depth = 0): ModalParts {
  const parts: ModalParts = {
    title: undefined,
    description: undefined,
    body: [],
  }
  React.Children.forEach(nodes, (child) => {
    if (!React.isValidElement(child)) {
      if (child) parts.body.push(child)
      return
    }
    const el = child as React.ReactElement<{
      className?: string
      children?: React.ReactNode
    }>
    if (el.type === DialogTitle) {
      parts.title = el.props.children
      parts.titleClassName = el.props.className
    } else if (el.type === DialogDescription) {
      parts.description = el.props.children
      parts.descriptionClassName = el.props.className
    } else if (el.type === DialogFooter) {
      parts.footer = el as React.ReactElement
    } else if (
      (el.type === DialogHeader || el.type === React.Fragment) &&
      depth < 2
    ) {
      const inner = extractModalParts(el.props.children, depth + 1)
      if (inner.title !== undefined) {
        parts.title = inner.title
        parts.titleClassName = inner.titleClassName
      }
      if (inner.description !== undefined) {
        parts.description = inner.description
        parts.descriptionClassName = inner.descriptionClassName
      }
      if (inner.footer) parts.footer = inner.footer
      parts.body.push(...inner.body)
    } else {
      parts.body.push(child)
    }
  })
  return parts
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  const ctx = React.useContext(DialogContext)
  const parts = extractModalParts(children)
  return (
    <WakiiModal
      open={ctx.open}
      onCancel={() => ctx.setOpen(false)}
      title={parts.title ?? null}
      footer={parts.footer ?? null}
      classNames={{
        wrapper: cn("text-left sm:max-w-lg", className),
        header:
          parts.title !== undefined
            ? parts.titleClassName
            : "hidden" /* không có title → ẩn hẳn strip header */,
        closeButton: showCloseButton ? undefined : "hidden",
      }}
    >
      {parts.description !== undefined && (
        <p
          data-slot="dialog-description"
          className={cn(
            "text-sm text-muted-foreground",
            parts.descriptionClassName
          )}
        >
          {parts.description}
        </p>
      )}
      {parts.body}
    </WakiiModal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  // Khi nằm trong DialogContent sẽ bị nhặt làm slot (không render); giữ bản
  // styled cho dùng standalone.
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  const ctx = React.useContext(DialogContext)
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <Button
          type="button"
          variant="outline"
          onClick={() => ctx.setOpen(false)}
        >
          Close
        </Button>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  children,
  ...props
}: React.ComponentProps<"h2">) {
  // Khi nằm trong DialogContent sẽ bị nhặt vào Modal `title` (không render);
  // giữ bản styled cho dùng standalone.
  return (
    <h2
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    >
      {children}
    </h2>
  )
}

function DialogDescription({
  className,
  children,
  ...props
}: React.ComponentProps<"p">) {
  // Khi nằm trong DialogContent sẽ bị nhặt render đầu body (không render ở đây).
  return (
    <p
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    >
      {children}
    </p>
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
