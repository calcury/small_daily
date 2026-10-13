import { useMemo } from 'react'
import type { ThemeMode } from '../types'
import { useSchedule } from '../store/ScheduleContext'
import { DataPanel } from './DataPanel'
import { Segmented } from './Sheet'
import { StatusManager } from './StatusManager'
import { IconMonitor, IconMoon, IconSun } from './icons'

export function SettingsTab() {
  const {
    data,
    statuses,
    addStatus,
    updateStatus,
    removeStatus,
    moveStatus,
    theme,
    setTheme,
    replaceData,
    resetData,
    notify,
  } = useSchedule()

  /** 每个状态被用在多少天的记录里 */
  const usageByStatus = useMemo(() => {
    const usage: Record<string, number> = {}
    for (const record of Object.values(data.days)) {
      const seen = new Set(record.segments.map((s) => s.statusId))
      for (const statusId of seen) {
        usage[statusId] = (usage[statusId] || 0) + 1
      }
    }
    return usage
  }, [data.days])

  return (
    <div className="tab-body">
      <section className="card">
        <div className="card-head">
          <h2 className="card-title">外观</h2>
        </div>
        <Segmented<ThemeMode>
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: '浅色', icon: <IconSun size={15} /> },
            { value: 'dark', label: '深色', icon: <IconMoon size={15} /> },
            { value: 'system', label: '跟随系统', icon: <IconMonitor size={15} /> },
          ]}
        />
      </section>

      <StatusManager
        statuses={statuses}
        usageByStatus={usageByStatus}
        onAdd={() => {
          addStatus()
          notify('已新建状态，记得改个名字和颜色')
        }}
        onUpdate={updateStatus}
        onRemove={(id) => {
          const name = statuses.find((s) => s.id === id)?.name ?? ''
          removeStatus(id)
          notify(`已删除「${name}」，相关时段已退回「无」`)
        }}
        onMove={moveStatus}
      />

      <DataPanel
        data={data}
        onReplace={replaceData}
        onNotify={notify}
        onReset={resetData}
      />
    </div>
  )
}
