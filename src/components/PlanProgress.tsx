import type { PlanTarget, StatusDef } from '../types'
import { buildPlanRows, completion } from '../lib/plans'
import { formatCompact } from '../lib/time'
import { IconCheck } from './icons'

interface PlanProgressProps {
  plans: PlanTarget[]
  statusMap: Record<string, StatusDef>
  /** 当天各状态的分钟数（今天按「此刻」裁剪过） */
  dayByStatus: Record<string, number>
  /** 本周（周一起）至今各状态的分钟数 */
  weekByStatus: Record<string, number>
  /** 当天线的标签：今天 / 昨天 / 8-03 … */
  dayLabel: string
  /** 本周线的标签：本周 / 当周 */
  weekLabel: string
  /** 还没有计划时，引导去计划页 */
  onOpenPlans: () => void
}

interface BarProps {
  label: string
  value: number
  target: number
  color: string
}

function TargetBar({ label, value, target, color }: BarProps) {
  const ratio = completion(value, target)
  const done = value >= target
  return (
    <div className={`plan-line${done ? ' is-done' : ''}`}>
      <span className="plan-line-label">{label}</span>
      <span className="plan-bar">
        <span
          className="plan-fill"
          style={{ width: `${ratio * 100}%`, background: color }}
        />
      </span>
      <span className="plan-line-value">
        {done ? (
          <span className="plan-check" aria-label="已完成">
            <IconCheck size={13} />
          </span>
        ) : null}
        <b>{formatCompact(value)}</b>
        <i>/{formatCompact(target)}</i>
      </span>
    </div>
  )
}

/**
 * 计划进度：按状态展示「今日」和「本周」目标完成了多少。
 * 取代了原先的「状态进度」（今天 vs 昨天的对比条）。
 */
export function PlanProgress({
  plans,
  statusMap,
  dayByStatus,
  weekByStatus,
  dayLabel,
  weekLabel,
  onOpenPlans,
}: PlanProgressProps) {
  const rows = buildPlanRows(plans, statusMap, dayByStatus, weekByStatus)

  if (rows.length === 0) {
    return (
      <section className="card" aria-label="计划进度">
        <div className="card-head">
          <h2 className="card-title">计划进度</h2>
        </div>
        <p className="empty-note">还没有计划。</p>
        <button type="button" className="ghost-btn" onClick={onOpenPlans}>
          去计划里添加每日 / 每周目标
        </button>
      </section>
    )
  }

  return (
    <section className="card" aria-label="计划进度">
      <div className="card-head">
        <h2 className="card-title">计划进度</h2>
        <span className="card-hint">{dayLabel}</span>
      </div>

      <ul className="plan-list">
        {rows.map((row) => (
          <li className="plan-item" key={row.plan.id}>
            <div className="plan-item-head">
              <span className="plan-dot" style={{ background: row.status.color }} />
              <span className="plan-name">{row.status.name}</span>
            </div>

            {row.plan.dailyMinutes > 0 ? (
              <TargetBar
                label={dayLabel}
                value={row.dayMinutes}
                target={row.plan.dailyMinutes}
                color={row.status.color}
              />
            ) : null}

            {row.plan.weeklyMinutes > 0 ? (
              <TargetBar
                label={weekLabel}
                value={row.weekMinutes}
                target={row.plan.weeklyMinutes}
                color={row.status.color}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
