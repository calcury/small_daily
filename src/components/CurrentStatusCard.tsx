import type { Segment, StatusDef } from '../types'
import { NONE_STATUS_ID } from '../types'
import { formatDuration, minutesToLabel } from '../lib/time'
import { IconClock, IconSpark } from './icons'

interface CurrentStatusCardProps {
  status: StatusDef
  segment: Segment
  nowMinute: number
  /** 昨天同一时刻的状态，作为一个小对比 */
  yesterdaySameStatus?: StatusDef | null
  trackedToday: number
  onSwitch: () => void
}

export function CurrentStatusCard({
  status,
  segment,
  nowMinute,
  yesterdaySameStatus,
  trackedToday,
  onSwitch,
}: CurrentStatusCardProps) {
  const elapsed = Math.max(0, nowMinute - segment.start)
  const isNone = status.id === NONE_STATUS_ID
  /** 今天只显示到「此刻」，未来留白（段可能一直记到 24:00） */
  const shownEnd = Math.min(segment.end, nowMinute)
  const rangeText =
    shownEnd > segment.start
      ? `${minutesToLabel(segment.start)} — ${minutesToLabel(shownEnd)}`
      : `${minutesToLabel(segment.start)} 起`

  return (
    <section className="card current" aria-label="当前状态">
      <div className="current-glow" style={{ background: status.color }} aria-hidden="true" />

      <div className="current-body">
        <p className="current-label">此刻正在</p>

        <button
          type="button"
          className="current-main"
          onClick={onSwitch}
          aria-label={`当前状态：${status.name}，点击切换`}
        >
          <span className="current-dot" style={{ background: status.color }} />
          <span className="current-name" style={{ color: isNone ? undefined : status.color }}>
            {status.name}
          </span>
          <span className="current-switch">切换</span>
        </button>

        <div className="current-meta">
          <span className="current-elapsed">
            <IconClock size={15} />
            已持续 {formatDuration(elapsed)}
          </span>
          <span className="current-range">{rangeText}</span>
        </div>
      </div>

      <div className="current-foot">
        <div className="current-stat">
          <span className="current-stat-k">今日已记录</span>
          <span className="current-stat-v">{formatDuration(trackedToday)}</span>
        </div>
        <div className="current-stat">
          <span className="current-stat-k">昨日此刻</span>
          <span className="current-stat-v">
            <IconSpark size={14} />
            {yesterdaySameStatus ? yesterdaySameStatus.name : '—'}
          </span>
        </div>
      </div>
    </section>
  )
}
