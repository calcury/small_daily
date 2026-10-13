import { useEffect, useState, type ReactNode } from 'react'
import { IconClose } from './icons'

interface SheetProps {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** 允许更高的高度（用于状态管理这类长列表） */
  tall?: boolean
}

/** 移动端友好的底部抽屉。桌面端会自动收成居中弹层。 */
export function Sheet({ open, title, subtitle, onClose, children, footer, tall }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="sheet-backdrop" onPointerDown={onClose} role="presentation">
      <div
        className={`sheet${tall ? ' sheet--tall' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <div className="sheet-title-wrap">
            <h3 className="sheet-title">{title}</h3>
            {subtitle ? <p className="sheet-subtitle">{subtitle}</p> : null}
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭">
            <IconClose size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

interface SegmentedProps<T extends string | number> {
  value: T
  options: Array<{ value: T; label: string; icon?: ReactNode }>
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
}: SegmentedProps<T>) {
  return (
    <div className={`segmented segmented--${size}`} role="tablist">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={`segmented-item${option.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  text?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

/** 居中确认弹窗：确定 / 取消 */
export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="dialog-backdrop" role="presentation" onPointerDown={onClose}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h3 className="dialog-title">{title}</h3>
        {text ? <p className="dialog-text">{text}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ConfirmButtonProps {
  label: string
  confirmLabel?: string
  onConfirm: () => void
  className?: string
  disabled?: boolean
  icon?: ReactNode
}

/** 两步确认按钮：第一次点击变成「确认删除」，3 秒后自动复原 */
export function ConfirmButton({
  label,
  confirmLabel = '确认删除？',
  onConfirm,
  className = '',
  disabled,
  icon,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const id = window.setTimeout(() => setArmed(false), 3000)
    return () => window.clearTimeout(id)
  }, [armed])

  return (
    <button
      type="button"
      className={`${className}${armed ? ' is-armed' : ''}`}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          onConfirm()
          setArmed(false)
        } else {
          setArmed(true)
        }
      }}
    >
      {icon}
      <span>{armed ? confirmLabel : label}</span>
    </button>
  )
}
