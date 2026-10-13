import type { StatusDef } from '../types'
import { DAY_MINUTES, NONE_STATUS_ID } from '../types'
import { formatCompact, formatDuration } from '../lib/time'

interface StatusProgressProps {
  statuses: StatusDef[]
  todayByStatus: Record<string, number>
  compareByStatus: Record<string, number>
  todayLabel: string
  compareLabel: string
}

const SCALE_TICKS = [0, 25, 50, 75, 100]

/**
 * 今日状态进度条 —— 实色是今天，浅色是昨天（对比）。
 * 长度按「占全天 1440 分钟的比例」计算，25% 一格正好 6 小时。
 */
export function StatusProgress({
  statuses,
  todayByStatus,
  compareByStatus,
  todayLabel,
  compareLabel,
}: StatusProgressProps) {
  const rows = statuses
    .filter((status) => (todayByStatus[status.id] || 0) > 0 || (compareByStatus[status.id] || 0) > 0)
    .sort((a, b) => {
      if (a.id === NONE_STATUS_ID) return 1
      if (b.id === NONE_STATUS_ID) return -1
      return (todayByStatus[b.id] || 0) - (todayByStatus[a.id] || 0)
    })

  if (rows.length === 0) {
    return (
      <section className="card" aria-label="状态进度">
        <div className="card-head">
          <h2 className="card-title">状态进度</h2>
        </div>
        <p className="empty-note">还没有任何记录。点一下当前状态卡片就能开始记录。</p>
      </section>
    )
  }

  return (
    <section className="card" aria-label="状态进度">
      <div className="card-head">
        <h2 className="card-title">状态进度</h2>
        <span className="card-hint">
          <span className="legend-swatch legend-swatch--solid" /> {todayLabel}
          <span className="legend-swatch legend-swatch--soft" /> {compareLabel}
        </span>
      </div>

      <div className="prog-scale" aria-hidden="true">
        {SCALE_TICKS.map((tick) => (
          <span key={tick} className="prog-scale-tick" style={{ left: `${tick}%` }}>
            {tick === 0 ? '' : `${(tick / 100) * 24}h`}
          </span>
        ))}
      </div>

      <ul className="prog-list">
        {rows.map((status) => {
          const today = todayByStatus[status.id] || 0
          const compare = compareByStatus[status.id] || 0
          const delta = today - compare
          const isNone = status.id === NONE_STATUS_ID
          return (
            <li className="prog-row" key={status.id}>
              <div className="prog-head">
                <span className="prog-dot" style={{ background: status.color }} />
                <span className="prog-name">{status.name}</span>
                <span className="prog-percent">
                  {today > 0 ? `${Math.round((today / DAY_MINUTES) * 100)}%` : '—'}
                </span>
                <span className="prog-duration">{formatDuration(today)}</span>
              </div>

              <div className="prog-bars">
                <div className="prog-track prog-track--today">
                  <span
                    className="prog-fill"
                    style={{ width: `${(today / DAY_MINUTES) * 100}%`, background: status.color }}
                  />
                </div>
                <div className="prog-track prog-track--compare">
                  <span
                    className="prog-fill"
                    style={{
                      width: `${(compare / DAY_MINUTES) * 100}%`,
                      background: status.color,
                      opacity: isNone ? 0.35 : 0.45,
                    }}
                  />
                </div>
              </div>

              <div className="prog-foot">
                <span>
                  {compareLabel} {formatCompact(compare)}
                </span>
                {compare > 0 || today > 0 ? (
                  <span className={`prog-delta${delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : ''}`}>
                    {delta === 0 ? '持平' : delta > 0 ? `▲ ${formatCompact(delta)}` : `▼ ${formatCompact(-delta)}`}
                  </span>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
