import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Segment, StatusDef } from '../types'
import { DAY_MINUTES, NONE_STATUS_ID } from '../types'
import { minutesToLabel } from '../lib/time'

/** 拖动吸附粒度（分钟） */
const SNAP = 5
/** 分界线的抓取半径（像素），让手指也够得着 */
const GRAB_RADIUS = 22
const RULER_HOURS = [0, 6, 12, 18, 24]
const GRID_HOURS = [3, 6, 9, 12, 15, 18, 21]

type DragLine = 'start' | 'end'

interface TimeRangePickerProps {
  /** 当天全部区段，用于画背景 */
  segments: Segment[]
  /** 正在编辑的区段 id（新建时为 null）：这一段在背景里按「空」显示 */
  editingId: string | null
  statusMap: Record<string, StatusDef>
  noneStatus: StatusDef
  start: number
  end: number
  /** 当前所选状态的颜色 */
  activeColor: string
  activeIsNone: boolean
  /** 今天的当前分钟数；查看历史日期时为 null */
  nowMinute: number | null
  onChange: (next: { start: number; end: number }) => void
}

/**
 * 可直接拖动的时间范围选择器
 *
 *  - 两条分界线可以左右滑动，拖动时吸附到 5 分钟
 *  - 今天只能改到「此刻」为止（之后的部分画成斜纹，拖不过去）；历史日期整天都能改
 *  - 背景用和正常一致的颜色画出当天的其它时段，方便知道会盖住谁
 *
 * 命中判定放在画布上统一做（「离哪条线更近就拖哪条」），
 * 所以哪怕区间只有几分钟、两条线几乎重叠，也依然分得开。
 */
export function TimeRangePicker({
  segments,
  editingId,
  statusMap,
  noneStatus,
  start,
  end,
  activeColor,
  activeIsNone,
  nowMinute,
  onChange,
}: TimeRangePickerProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ line: DragLine; pointerId: number } | null>(null)
  const [dragging, setDragging] = useState<DragLine | null>(null)

  const pct = (minute: number) => `${(minute / DAY_MINUTES) * 100}%`

  /** 可编辑的最晚时间：今天卡在「此刻」，历史日期整天都能改 */
  const maxMinute = nowMinute ?? DAY_MINUTES

  const snap = (minute: number) =>
    Math.max(0, Math.min(DAY_MINUTES, Math.round(minute / SNAP) * SNAP))

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return

    const toPx = (minute: number) => rect.left + (minute / DAY_MINUTES) * rect.width
    const distStart = Math.abs(event.clientX - toPx(start))
    const distEnd = Math.abs(event.clientX - toPx(end))

    // 两条线离得很近时，谁更近就拖谁；离两条线都远则不响应
    if (distStart > GRAB_RADIUS && distEnd > GRAB_RADIUS) return
    const line: DragLine = distStart <= distEnd ? 'start' : 'end'

    event.preventDefault()
    try {
      el.setPointerCapture(event.pointerId)
    } catch {
      /* 某些浏览器可能不支持，忽略即可 */
    }
    dragRef.current = { line, pointerId: event.pointerId }
    setDragging(line)
  }

  const onDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const el = trackRef.current
    if (!drag || !el || drag.pointerId !== event.pointerId) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    event.preventDefault()

    const raw = snap(((event.clientX - rect.left) / rect.width) * DAY_MINUTES)

    if (drag.line === 'start') {
      const next = Math.min(raw, end - SNAP)
      if (next !== start) onChange({ start: next, end })
    } else {
      // 结束时间不能越过「此刻」
      const next = Math.min(Math.max(raw, start + SNAP), maxMinute)
      if (next !== end) onChange({ start, end: next })
    }
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(null)
  }

  /** 分界线支持键盘微调 */
  const onHandleKeyDown = (line: DragLine) => (event: ReactKeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? 15 : SNAP
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const delta = event.key === 'ArrowLeft' ? -step : step
      if (line === 'start') {
        onChange({ start: Math.max(0, Math.min(end - SNAP, start + delta)), end })
      } else {
        onChange({ start, end: Math.min(maxMinute, Math.max(start + SNAP, end + delta)) })
      }
    }
  }

  return (
    <div className={`rtp${dragging ? ' is-dragging' : ''}`}>
      <div className="rtp-ruler" aria-hidden="true">
        {RULER_HOURS.map((hour, index) => (
          <span
            key={hour}
            className="rtp-ruler-tick"
            style={{
              left: `${(hour / 24) * 100}%`,
              transform:
                index === 0
                  ? 'translateX(0)'
                  : index === RULER_HOURS.length - 1
                    ? 'translateX(-100%)'
                    : 'translateX(-50%)',
            }}
          >
            {hour}:00
          </span>
        ))}
      </div>

      <div className="rtp-track-wrap">
        <div
          className="rtp-track"
          ref={trackRef}
          onPointerDown={beginDrag}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* 背景：当天其它时段用正常颜色；正在编辑的那一段先按「空」占位 */}
          <div className="rtp-bg" aria-hidden="true">
            {segments.map((segment) => {
              const status = statusMap[segment.statusId] ?? noneStatus
              const asNone = segment.id === editingId || status.id === NONE_STATUS_ID
              return (
                <span
                  key={segment.id}
                  className={`rtp-bg-seg${asNone ? ' is-none' : ''}`}
                  style={{
                    left: pct(segment.start),
                    width: pct(segment.end - segment.start),
                    background: asNone ? undefined : status.color,
                  }}
                />
              )
            })}
          </div>

          <div className="rtp-grids" aria-hidden="true">
            {GRID_HOURS.map((hour) => (
              <span key={hour} className="rtp-grid" style={{ left: pct(hour * 60) }} />
            ))}
            {nowMinute !== null ? (
              <span className="rtp-now" style={{ left: pct(nowMinute) }} />
            ) : null}
            {/* 「此刻」之后：还不能记录 */}
            {maxMinute < DAY_MINUTES ? (
              <span className="rtp-locked" style={{ left: pct(maxMinute) }} />
            ) : null}
          </div>

          {/* 选中的区间：纯视觉，拖动只认两条分界线 */}
          <div
            className={`rtp-selected${activeIsNone ? ' is-none' : ''}`}
            style={{
              left: pct(start),
              width: pct(Math.max(0, end - start)),
              background: activeIsNone ? undefined : activeColor,
            }}
            aria-hidden="true"
          />

          {/* 两条分界线（纯视觉，命中判定在画布上做） */}
          <span
            className="rtp-handle rtp-handle--start"
            style={{ left: pct(start) }}
            role="slider"
            tabIndex={0}
            aria-label="开始时间"
            aria-valuemin={0}
            aria-valuemax={DAY_MINUTES}
            aria-valuenow={start}
            aria-valuetext={minutesToLabel(start)}
            onKeyDown={onHandleKeyDown('start')}
          >
            <span className="rtp-handle-bar" />
          </span>

          <span
            className="rtp-handle rtp-handle--end"
            style={{ left: pct(end) }}
            role="slider"
            tabIndex={0}
            aria-label="结束时间"
            aria-valuemin={0}
            aria-valuemax={DAY_MINUTES}
            aria-valuenow={end}
            aria-valuetext={minutesToLabel(end)}
            onKeyDown={onHandleKeyDown('end')}
          >
            <span className="rtp-handle-bar" />
          </span>
        </div>
      </div>
    </div>
  )
}
