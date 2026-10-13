import { useEffect, useMemo, useState } from 'react'
import { parseDateKey, toDateKey } from '../lib/time'
import { Sheet } from './Sheet'
import { IconChevronLeft, IconChevronRight } from './icons'

interface CalendarSheetProps {
  open: boolean
  dateKey: string
  todayKey: string
  /** 该天是否已有记录（有记录的日子在日历上点一个小点） */
  hasRecord: (key: string) => boolean
  onSelect: (key: string) => void
  onClose: () => void
}

const WEEK = ['一', '二', '三', '四', '五', '六', '日']

/** 日历：选一天进入。未来（今天之后）不可选。 */
export function CalendarSheet({
  open,
  dateKey,
  todayKey,
  hasRecord,
  onSelect,
  onClose,
}: CalendarSheetProps) {
  const [cursor, setCursor] = useState(() => {
    const d = parseDateKey(dateKey)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  // 每次打开回到当前所选日期所在的月份
  useEffect(() => {
    if (!open) return
    const d = parseDateKey(dateKey)
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
  }, [open, dateKey])

  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1)
    const lead = (first.getDay() + 6) % 7 // 以周一为每周第一天
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
    const out: Array<string | null> = []
    for (let i = 0; i < lead; i += 1) out.push(null)
    for (let day = 1; day <= daysInMonth; day += 1) {
      out.push(toDateKey(new Date(cursor.y, cursor.m, day)))
    }
    return out
  }, [cursor])

  const canGoNext = useMemo(() => {
    const today = parseDateKey(todayKey)
    return (
      cursor.y < today.getFullYear() ||
      (cursor.y === today.getFullYear() && cursor.m < today.getMonth())
    )
  }, [cursor, todayKey])

  const shift = (delta: number) => {
    setCursor((prev) => {
      const d = new Date(prev.y, prev.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  const pick = (key: string) => {
    onSelect(key)
    onClose()
  }

  return (
    <Sheet
      open={open}
      title="选择日期"
      onClose={onClose}
      footer={
        <div className="sheet-actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={dateKey === todayKey}
            onClick={() => pick(todayKey)}
          >
            回到今天
          </button>
        </div>
      }
    >
      <div className="cal-head">
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          aria-label="上个月"
          onClick={() => shift(-1)}
        >
          <IconChevronLeft size={18} />
        </button>
        <span className="cal-month">
          {cursor.y} 年 {cursor.m + 1} 月
        </span>
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          aria-label="下个月"
          disabled={!canGoNext}
          onClick={() => shift(1)}
        >
          <IconChevronRight size={18} />
        </button>
      </div>

      <div className="cal-week" aria-hidden="true">
        {WEEK.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((key, index) => {
          if (!key) return <span key={`blank-${index}`} className="cal-cell is-blank" />
          const className = [
            'cal-cell',
            key === todayKey ? 'is-today' : '',
            key === dateKey ? 'is-selected' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={key}
              type="button"
              className={className}
              disabled={key > todayKey}
              aria-label={key}
              aria-current={key === todayKey ? 'date' : undefined}
              onClick={() => pick(key)}
            >
              {parseDateKey(key).getDate()}
              {hasRecord(key) ? <span className="cal-dot" aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
