import { useEffect, useState } from 'react'
import { useSchedule } from '../store/ScheduleContext'
import { MAX_DAILY_MINUTES, MAX_WEEKLY_MINUTES } from '../lib/plans'
import { ConfirmButton } from './Sheet'
import { IconPlus, IconTrash } from './icons'

/** 分钟 → 输入框文本（小时），0 显示为空 */
function minutesToText(minutes: number): string {
  if (minutes <= 0) return ''
  return String(Math.round((minutes / 60) * 100) / 100)
}

interface HoursFieldProps {
  label: string
  minutes: number
  maxMinutes: number
  onCommit: (minutes: number) => void
}

/**
 * 「X 小时」输入框。内部保留一份文本态，避免打字中途被外部值顶掉
 * （比如输入「1.5」时先敲出「1.」不会被立刻改成「1」）。
 */
function HoursField({ label, minutes, maxMinutes, onCommit }: HoursFieldProps) {
  const [text, setText] = useState(() => minutesToText(minutes))

  // 只在外部值和当前文本「对不上」时才回写（导入数据、换状态等），打字过程不受影响
  useEffect(() => {
    const parsed = text.trim() === '' ? 0 : Number(text)
    const current = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 60) : 0
    if (current !== minutes) setText(minutesToText(minutes))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes])

  const handleChange = (raw: string) => {
    setText(raw)
    if (raw.trim() === '') {
      onCommit(0)
      return
    }
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return
    onCommit(Math.min(Math.round(n * 60), maxMinutes))
  }

  return (
    <label className="plan-field">
      <span className="plan-field-label">{label}</span>
      <span className="plan-field-input">
        <input
          type="text"
          inputMode="decimal"
          className="plan-num-input"
          value={text}
          placeholder="0"
          aria-label={label}
          onChange={(event) => handleChange(event.target.value)}
          onBlur={() => setText(minutesToText(minutes))}
        />
        <span className="plan-field-unit">小时</span>
      </span>
    </label>
  )
}

/** 计划页：给每个状态定「每天」和「每周」的目标时长 */
export function PlansTab() {
  const { customStatuses, statusMap, plans, addPlan, updatePlan, removePlan, notify } =
    useSchedule()

  const handleAdd = () => {
    const created = addPlan()
    const name = statusMap[created.statusId]?.name ?? ''
    notify(name ? `已新增「${name}」的计划` : '已新增一条计划')
  }

  return (
    <div className="tab-body">
      <section className="card">
        <div className="card-head">
          <h2 className="card-title">计划目标</h2>
          <button type="button" className="mini-btn mini-btn--solid" onClick={handleAdd}>
            <IconPlus size={15} />
            新建计划
          </button>
        </div>

        {plans.length === 0 ? (
          <p className="empty-note">还没有计划。</p>
        ) : (
          <ul className="plan-edit-list">
            {plans.map((plan) => {
              const status = statusMap[plan.statusId]
              return (
                <li className="plan-edit-row" key={plan.id}>
                  <div className="plan-edit-head">
                    <span
                      className="color-swatch"
                      style={{ background: status?.color ?? '#94a3b8' }}
                    />
                    <select
                      className="select-input"
                      value={plan.statusId}
                      aria-label="计划对应的状态"
                      onChange={(event) => updatePlan(plan.id, { statusId: event.target.value })}
                    >
                      {customStatuses.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <ConfirmButton
                      className="icon-btn icon-btn--sm icon-btn--danger"
                      label=""
                      confirmLabel="确认"
                      icon={<IconTrash size={15} />}
                      onConfirm={() => removePlan(plan.id)}
                    />
                  </div>

                  <div className="plan-edit-fields">
                    <HoursField
                      label="每天"
                      minutes={plan.dailyMinutes}
                      maxMinutes={MAX_DAILY_MINUTES}
                      onCommit={(value) => updatePlan(plan.id, { dailyMinutes: value })}
                    />
                    <HoursField
                      label="每周"
                      minutes={plan.weeklyMinutes}
                      maxMinutes={MAX_WEEKLY_MINUTES}
                      onCommit={(value) => updatePlan(plan.id, { weeklyMinutes: value })}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
