import { useEffect, useState } from 'react'
import type { StatusDef } from '../types'
import { NONE_STATUS_ID } from '../types'
import { minutesToLabel } from '../lib/time'
import { Sheet } from './Sheet'

interface StatusPickerProps {
  open: boolean
  statuses: StatusDef[]
  currentStatusId: string
  fromMinute: number
  onPick: (statusId: string, fromMinute: number) => void
  onClose: () => void
}

function toInputValue(minute: number): string {
  const m = Math.max(0, Math.min(1439, Math.round(minute)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** 从某一刻开始切换状态——主界面上点「当前状态」就会打开它 */
export function StatusPicker({
  open,
  statuses,
  currentStatusId,
  fromMinute,
  onPick,
  onClose,
}: StatusPickerProps) {
  const [from, setFrom] = useState(fromMinute)

  useEffect(() => {
    if (open) setFrom(fromMinute)
  }, [open, fromMinute])

  return (
    <Sheet open={open} title="切换状态" onClose={onClose}>
      <div className="switch-from">
        <span className="switch-from-label">从这一刻开始</span>
        <input
          type="time"
          className="time-input"
          step={300}
          value={toInputValue(from)}
          onChange={(event) => {
            const parts = event.target.value.split(':')
            if (parts.length < 2) return
            const h = Number(parts[0])
            const m = Number(parts[1])
            if (Number.isFinite(h) && Number.isFinite(m)) setFrom(h * 60 + m)
          }}
        />
        <button type="button" className="mini-btn" onClick={() => setFrom(fromMinute)}>
          现在 {minutesToLabel(fromMinute)}
        </button>
      </div>

      <div className="picker-grid">
        {statuses.map((status) => {
          const active = status.id === currentStatusId
          const isNone = status.id === NONE_STATUS_ID
          return (
            <button
              key={status.id}
              type="button"
              className={`picker-item${active ? ' is-active' : ''}`}
              style={{ borderLeftColor: status.color }}
              onClick={() => {
                onPick(status.id, from)
                onClose()
              }}
            >
              <span className="picker-dot" style={{ background: status.color }} />
              <span className="picker-name">{status.name}</span>
              {active ? (
                <span className="picker-tag">
                  {isNone ? '空闲' : '当前'}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
