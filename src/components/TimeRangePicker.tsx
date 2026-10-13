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

type DragMode = 'start' | 'end' | 'move'

interface TimeRangePickerProps {
  /** 当天全部区段，用于画浅色背景 */
  segments: Segment[]
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
 *  - 中间整块可以整体平移
 *  - 背景用浅色画出当天的其它时段，方便知道会盖住谁
 *
 * 命中判定放在画布上统一做（「离哪条线更近就拖哪条」），
 * 所以哪怕区间只有几分钟、两条线几乎重叠，也依然分得开。
 */
export function TimeRangePicker({
  segments,
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
  const dragRef = useRef<{
    mode: DragMode
    pointerId: number
    originMinute: number
    baseStart: number
    baseEnd: number
  } | null>(null)
  const [dragging, setDragging] = useState<DragMode | null>(null)

  const pct = (minute: number) => `${(minute / DAY_MINUTES) * 100}%`

  const snap = (minute: number) =>
    Math.max(0, Math.min(DAY_MINUTES, Math.round(minute / SNAP) * SNAP))

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return

    const toPx = (minute: number) => rect.left + (minute / DAY_MINUTES) * rect.width
    const startX = toPx(start)
    const endX = toPx(end)
    const distStart = Math.abs(event.clientX - startX)
    const distEnd = Math.abs(event.clientX - endX)

    let mode: DragMode | null = null
    if (distStart <= GRAB_RADIUS || distEnd <= GRAB_RADIUS) {
      // 两条线离得很近时，谁更近就拖谁
      mode = distStart <= distEnd ? 'start' : 'end'
    } else if (event.clientX > startX && event.clientX < endX) {
      mode = 'move'
    }
    if (!mode) return

    event.preventDefault()
    try {
      el.setPointerCapture(event.pointerId)
    } catch {
      /* 某些浏览器可能不支持，忽略即可 */
    }
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      originMinute: ((event.clientX - rect.left) / rect.width) * DAY_MINUTES,
      baseStart: start,
      baseEnd: end,
    }
    setDragging(mode)
  }

  const onDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const el = trackRef.current
    if (!drag || !el || drag.pointerId !== event.pointerId) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    event.preventDefault()

    const raw = ((event.clientX - rect.left) / rect.width) * DAY_MINUTES

    if (drag.mode === 'start') {
      const next = Math.min(snap(raw), end - SNAP)
      if (next !== start) onChange({ start: next, end })
      return
    }

    if (drag.mode === 'end') {
      const next = Math.max(snap(raw), start + SNAP)
      if (next !== end) onChange({ start, end: next })
      return
    }

    const duration = drag.baseEnd - drag.baseStart
    const shifted = Math.round((drag.baseStart + (raw - drag.originMinute)) / SNAP) * SNAP
    const nextStart = Math.max(0, Math.min(DAY_MINUTES - duration, shifted))
    if (nextStart !== start) onChange({ start: nextStart, end: nextStart + duration })
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(null)
  }

  /** 分界线支持键盘微调 */
  const onHandleKeyDown = (mode: 'start' | 'end') => (event: ReactKeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? 15 : SNAP
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const delta = event.key === 'ArrowLeft' ? -step : step
      if (mode === 'start') {
        onChange({ start: Math.max(0, Math.min(end - SNAP, start + delta)), end })
      } else {
        onChange({ start, end: Math.min(DAY_MINUTES, Math.max(start + SNAP, end + delta)) })
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
          {/* 背景：当天的其它时段，浅色 */}
          <div className="rtp-bg" aria-hidden="true">
            {segments.map((segment) => {
              const status = statusMap[segment.statusId] ?? noneStatus
              if (status.id === NONE_STATUS_ID) return null
              return (
                <span
                  key={segment.id}
                  className="rtp-bg-seg"
                  style={{
                    left: pct(segment.start),
                    width: pct(segment.end - segment.start),
                    background: status.color,
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
          </div>

          {/* 选中区间：整块可以拖动平移 */}
          <div
            className={`rtp-selected${activeIsNone ? ' is-none' : ''}`}
            style={{
              left: pct(start),
              width: pct(Math.max(0, end - start)),
              background: activeIsNone ? undefined : activeColor,
            }}
            title="按住中间可以整段平移"
          >
            <span className="rtp-selected-grip" aria-hidden="true" />
          </div>

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
