import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Segment, StatusDef } from '../types'
import { DAY_MINUTES, NONE_STATUS_ID } from '../types'
import { segmentAt } from '../lib/segments'
import { formatCompact, minutesToLabel } from '../lib/time'
import { IconPlus } from './icons'

interface TimelineProps {
  segments: Segment[]
  statusMap: Record<string, StatusDef>
  noneStatus: StatusDef
  /** 今天的当前分钟数；查看历史日期时为 null */
  nowMinute: number | null
  selectedId: string | null
  /** 点选某一段，同时带上点击位置的分钟数 */
  onPick: (segment: Segment, minute: number) => void
  onAdd: () => void
}

const HOUR_TICKS = [0, 6, 12, 18, 24]
const GRIDLINES = [3, 6, 9, 12, 15, 18, 21]

/**
 * 24 小时时间轴：一整天的状态分布。
 * 点选按坐标定位（而不是按区段元素），所以再窄的时段也能点中。
 */
export function Timeline({
  segments,
  statusMap,
  noneStatus,
  nowMinute,
  selectedId,
  onPick,
  onAdd,
}: TimelineProps) {
  const nowPercent = nowMinute === null ? null : (nowMinute / DAY_MINUTES) * 100
  const tapRef = useRef<{
    pointerId: number
    x: number
    y: number
    at: number
    minute: number
    segment: Segment
  } | null>(null)

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const raw = ((event.clientX - rect.left) / rect.width) * DAY_MINUTES
    const minute = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(raw)))
    const segment = segmentAt(segments, minute)
    if (!segment) return
    tapRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: Date.now(),
      minute,
      segment,
    }
  }

  // 只有「几乎没有移动的短按」才算点选，避免滚动页面时误触
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const tap = tapRef.current
    tapRef.current = null
    if (!tap || tap.pointerId !== event.pointerId) return
    const moved = Math.hypot(event.clientX - tap.x, event.clientY - tap.y)
    if (moved > 10 || Date.now() - tap.at > 700) return
    onPick(tap.segment, tap.minute)
  }

  return (
    <section className="card timeline-card" aria-label="24 小时时间轴">
      <div className="card-head">
        <h2 className="card-title">全天时间轴</h2>
        <button type="button" className="mini-btn" onClick={onAdd}>
          <IconPlus size={15} />
          添加时段
        </button>
      </div>

      <div className="tl-wrap">
        <div
          className="tl-bar"
          role="group"
          aria-label="点击任意位置修改该时段"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            tapRef.current = null
          }}
        >
          {segments.map((segment) => {
            const duration = segment.end - segment.start
            const status = statusMap[segment.statusId] ?? noneStatus
            const width = (duration / DAY_MINUTES) * 100
            const showLabel = width >= 7
            const isNone = status.id === NONE_STATUS_ID
            return (
              <span
                key={segment.id}
                className={`tl-seg${isNone ? ' is-none' : ''}${
                  selectedId === segment.id ? ' is-selected' : ''
                }`}
                style={{ width: `${width}%`, background: status.color }}
                title={`${minutesToLabel(segment.start)} – ${minutesToLabel(segment.end)} ${status.name}（${formatCompact(duration)}）`}
              >
                {showLabel ? <span className="tl-seg-label">{status.name}</span> : null}
              </span>
            )
          })}

          {GRIDLINES.map((hour) => (
            <span
              key={hour}
              className="tl-gridline"
              style={{ left: `${(hour / 24) * 100}%` }}
              aria-hidden="true"
            />
          ))}

          {/* 今天：未来时段压半透明，一眼看出「还没发生」 */}
          {nowPercent !== null ? (
            <>
              <span className="tl-future" style={{ left: `${nowPercent}%` }} aria-hidden="true" />
              <span className="tl-now" style={{ left: `${nowPercent}%` }} aria-hidden="true">
                <span className="tl-now-dot" />
              </span>
            </>
          ) : null}
        </div>

        <div className="tl-axis" aria-hidden="true">
          {HOUR_TICKS.map((hour, index) => {
            const align = index === 0 ? 'start' : index === HOUR_TICKS.length - 1 ? 'end' : 'center'
            return (
              <span
                key={hour}
                className="tl-tick"
                style={{
                  left: `${(hour / 24) * 100}%`,
                  transform:
                    align === 'start'
                      ? 'translateX(0)'
                      : align === 'end'
                        ? 'translateX(-100%)'
                        : 'translateX(-50%)',
                }}
              >
                {hour}:00
              </span>
            )
          })}
        </div>

        <p className="tl-hint">
          {nowMinute === null
            ? '点一下任意位置就能改那一段'
            : '点一下任意位置就能改那一段；斜纹部分还没到，不能改'}
        </p>
      </div>
    </section>
  )
}
