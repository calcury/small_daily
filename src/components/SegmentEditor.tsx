import { useEffect, useMemo, useState } from 'react'
import type { EditPayload, Segment, StatusDef } from '../types'
import { DAY_MINUTES, NONE_STATUS_ID } from '../types'
import { formatDuration, minutesToLabel } from '../lib/time'
import { Sheet } from './Sheet'
import { TimeRangePicker } from './TimeRangePicker'
import { IconCheck } from './icons'

const SNAP = 5

interface SegmentEditorProps {
  open: boolean
  /** 传入则代表编辑已有区段，null 代表新建 */
  editing: Segment | null
  /** 当天全部区段，用于在拖动画布上画背景 */
  segments: Segment[]
  statuses: StatusDef[]
  statusMap: Record<string, StatusDef>
  noneStatus: StatusDef
  initial: { start: number; end: number; statusId: string }
  /** 今天的当前分钟数；查看历史日期时为 null */
  nowMinute: number | null
  onClose: () => void
  onSave: (payload: EditPayload) => void
}

function toInputValue(minute: number): string {
  const m = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(minute)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function fromInputValue(value: string): number | null {
  const parts = value.split(':')
  if (parts.length < 2) return null
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return Math.max(0, Math.min(DAY_MINUTES, h * 60 + m))
}

function clampMinute(value: number): number {
  return Math.max(0, Math.min(DAY_MINUTES, Math.round(value)))
}

/** 时段编辑器：拖动分界线 / 改时间范围 / 改状态类型 / 把彩色改回「无」 */
export function SegmentEditor({
  open,
  editing,
  segments,
  statuses,
  statusMap,
  noneStatus,
  initial,
  nowMinute,
  onClose,
  onSave,
}: SegmentEditorProps) {
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const [statusId, setStatusId] = useState(initial.statusId)

  useEffect(() => {
    if (!open) return
    const source = editing ?? { start: initial.start, end: initial.end, statusId: initial.statusId }
    setStart(source.start)
    setEnd(source.end)
    setStatusId(source.statusId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  /** 可编辑的最晚时间：今天卡在「此刻」，历史日期整天都能改 */
  const maxMinute = nowMinute ?? DAY_MINUTES
  const invalid = end <= start
  const endAtMidnight = end >= DAY_MINUTES
  const activeIsNone = statusId === NONE_STATUS_ID
  const selectedStatus = useMemo(
    () => statusMap[statusId] ?? noneStatus,
    [statusMap, statusId, noneStatus]
  )

  const nudge = (which: 'start' | 'end', delta: number) => {
    if (which === 'start') {
      setStart((prev) => clampMinute(Math.min(prev + delta, end - SNAP)))
    } else {
      setEnd((prev) => Math.min(maxMinute, clampMinute(Math.max(prev + delta, start + SNAP))))
    }
  }

  const handleSave = () => {
    if (invalid) return
    onSave({
      original: editing ? { start: editing.start, end: editing.end } : undefined,
      start,
      end,
      statusId,
    })
    onClose()
  }

  const stepButtons = (which: 'start' | 'end') => (
    <div className="nudge">
      <button type="button" onClick={() => nudge(which, -15)} aria-label="减 15 分钟">
        −15
      </button>
      <button type="button" onClick={() => nudge(which, -5)} aria-label="减 5 分钟">
        −5
      </button>
      <button type="button" onClick={() => nudge(which, 5)} aria-label="加 5 分钟">
        +5
      </button>
      <button type="button" onClick={() => nudge(which, 15)} aria-label="加 15 分钟">
        +15
      </button>
    </div>
  )

  return (
    <Sheet
      open={open}
      tall
      title={editing && editing.statusId !== NONE_STATUS_ID ? '修改时段' : '设置时段'}
      onClose={onClose}
      footer={
        <div className="sheet-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={invalid}
            onClick={handleSave}
          >
            <IconCheck size={16} />
            保存
          </button>
        </div>
      }
    >
      <TimeRangePicker
        segments={segments}
        editingId={editing?.id ?? null}
        statusMap={statusMap}
        noneStatus={noneStatus}
        start={start}
        end={end}
        activeColor={selectedStatus.color}
        activeIsNone={activeIsNone}
        nowMinute={nowMinute}
        onChange={(next) => {
          setStart(next.start)
          setEnd(next.end)
        }}
      />

      <div className="rtp-readout">
        <span className="rtp-readout-time">
          <b>{minutesToLabel(start)}</b>
          <i>→</i>
          <b>{minutesToLabel(end)}</b>
        </span>
        <span className={`rtp-readout-duration${invalid ? ' is-error' : ''}`}>
          {invalid ? '结束时间必须晚于开始时间' : `共 ${formatDuration(end - start)}`}
        </span>
      </div>

      {/* 精确输入 */}
      <div className="field-group">
        <div className="field-label">精确到分钟</div>

        <div className="time-field">
          <span className="time-field-tag">开始</span>
          <input
            type="time"
            className="time-input"
            step={300}
            value={toInputValue(start)}
            onChange={(event) => {
              const next = fromInputValue(event.target.value)
              if (next !== null) setStart(next)
            }}
          />
          {stepButtons('start')}
          {nowMinute !== null ? (
            <button
              type="button"
              className="mini-btn"
              onClick={() => setStart(clampMinute(Math.min(nowMinute, end - SNAP)))}
            >
              现在
            </button>
          ) : null}
        </div>

        <div className="time-field">
          <span className="time-field-tag">结束</span>
          <input
            type="time"
            className="time-input"
            step={300}
            disabled={endAtMidnight}
            value={endAtMidnight ? '23:59' : toInputValue(end)}
            onChange={(event) => {
              const next = fromInputValue(event.target.value)
              if (next !== null) setEnd(Math.min(next, maxMinute))
            }}
          />
          {stepButtons('end')}
          {nowMinute !== null ? (
            <button
              type="button"
              className="mini-btn"
              onClick={() => setEnd(Math.min(maxMinute, clampMinute(Math.max(nowMinute, start + SNAP))))}
            >
              现在
            </button>
          ) : null}
        </div>

        {/* 历史日期才能拉到当天 24:00；今天最多到「此刻」 */}
        {maxMinute >= DAY_MINUTES ? (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={endAtMidnight}
              onChange={(event) => {
                if (event.target.checked) setEnd(DAY_MINUTES)
                else if (end >= DAY_MINUTES) setEnd(DAY_MINUTES - SNAP)
              }}
            />
            结束时间到当天 24:00
          </label>
        ) : null}
      </div>

      {/* 状态 */}
      <div className="field-group">
        <div className="field-label">状态类型</div>
        <div className="status-grid">
          {statuses.map((status) => {
            const active = status.id === statusId
            const isNone = status.id === NONE_STATUS_ID
            return (
              <button
                key={status.id}
                type="button"
                className={`status-chip${active ? ' is-active' : ''}${isNone ? ' is-none' : ''}`}
                style={
                  active
                    ? { background: status.color, borderColor: status.color, color: '#fff' }
                    : { borderColor: 'var(--border)' }
                }
                onClick={() => setStatusId(status.id)}
              >
                <span
                  className="status-chip-dot"
                  style={{ background: active ? '#fff' : status.color }}
                />
                {status.name}
              </button>
            )
          })}
        </div>
      </div>
    </Sheet>
  )
}
