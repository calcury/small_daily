import { useEffect, useMemo, useState } from 'react'
import type { EditPayload, Segment } from './types'
import { DAY_MINUTES, NONE_STATUS_ID } from './types'
import { useNow } from './hooks/useNow'
import { useSchedule } from './store/ScheduleContext'
import {
  addDays,
  formatDuration,
  monthDayLabel,
  nowMinutes,
  toDateKey,
  weekdayLabel,
} from './lib/time'
import { clipSegments, segmentAt, trackedMinutes } from './lib/segments'
import { dayStat } from './lib/stats'
import { Header } from './components/Header'
import { CurrentStatusCard } from './components/CurrentStatusCard'
import { Timeline } from './components/Timeline'
import { StatusProgress } from './components/StatusProgress'
import { SegmentEditor } from './components/SegmentEditor'
import { StatusPicker } from './components/StatusPicker'
import { StatsTab } from './components/StatsTab'
import { SettingsTab } from './components/SettingsTab'
import { IconCalendar, IconChartLine, IconGear } from './components/icons'

type TabKey = 'today' | 'stats' | 'settings'

/** 拖动吸附粒度，与编辑器保持一致 */
const SNAP = 5

function floorTo(value: number, step: number): number {
  return Math.floor(value / step) * step
}

export function App() {
  const {
    data,
    statuses,
    statusMap,
    noneStatus,
    customStatuses,
    theme,
    setTheme,
    saveState,
    flashMessage,
    notify,
    getSegments,
    applyEdit,
    setStatusFrom,
  } = useSchedule()

  const now = useNow(30000)
  const todayKey = toDateKey(now)
  const currentMinute = nowMinutes(now)

  const [tab, setTab] = useState<TabKey>('today')
  const [dateKey, setDateKey] = useState(todayKey)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Segment | null>(null)
  const [editorInitial, setEditorInitial] = useState({
    start: 0,
    end: 60,
    statusId: NONE_STATUS_ID,
  })
  const [pickerOpen, setPickerOpen] = useState(false)

  // 不允许浏览未来
  useEffect(() => {
    if (dateKey > todayKey) setDateKey(todayKey)
  }, [dateKey, todayKey])

  const isToday = dateKey === todayKey
  const segments = getSegments(dateKey)
  const compareKey = addDays(dateKey, -1)

  const stats = useMemo(
    () => dayStat(data, dateKey, todayKey, currentMinute),
    [data, dateKey, todayKey, currentMinute]
  )
  const compareStats = useMemo(
    () => dayStat(data, compareKey, todayKey, currentMinute),
    [data, compareKey, todayKey, currentMinute]
  )

  const currentSegment = useMemo(
    () => (isToday ? segmentAt(segments, currentMinute) : undefined),
    [isToday, segments, currentMinute]
  )

  const currentStatus = currentSegment
    ? statusMap[currentSegment.statusId] ?? noneStatus
    : noneStatus

  const yesterdaySameStatus = useMemo(() => {
    if (!isToday) return null
    const yesterdaySegments = getSegments(compareKey)
    const segment = segmentAt(yesterdaySegments, currentMinute)
    return segment ? statusMap[segment.statusId] ?? noneStatus : null
  }, [isToday, compareKey, currentMinute, getSegments, statusMap, noneStatus])

  const trackedToday = useMemo(
    () => trackedMinutes(isToday ? clipSegments(segments, currentMinute) : segments),
    [segments, isToday, currentMinute]
  )

  /**
   * 点选时间轴上的某一处：直接把这一整段作为被选中事件打开。
   * 无论是彩色时段还是灰色的「空」，行为完全一致 —— 一样能拖分界线改长度、改状态。
   */
  const openEditorAt = (segment: Segment) => {
    setSelectedId(segment.id)
    setEditing(segment)
    setEditorInitial({
      start: segment.start,
      end: segment.end,
      statusId: segment.statusId,
    })
    setEditorOpen(true)
  }

  /** 手动添加：落在最大的空白时段里 */
  const openCreate = () => {
    const gaps = [...segments]
      .filter((s) => s.statusId === NONE_STATUS_ID)
      .sort((a, b) => b.end - b.start - (a.end - a.start))
    const gap = gaps[0]

    let start: number
    let end: number

    if (gap && gap.end - gap.start >= 15) {
      start = floorTo(gap.start, SNAP)
      end = Math.min(gap.end, start + 60)
    } else if (isToday) {
      start = Math.min(floorTo(currentMinute, SNAP), DAY_MINUTES - 15)
      end = Math.min(DAY_MINUTES, start + 60)
    } else {
      start = 9 * 60
      end = 10 * 60
    }

    setSelectedId(null)
    setEditing(null)
    setEditorInitial({
      start,
      end,
      statusId: customStatuses[0]?.id ?? NONE_STATUS_ID,
    })
    setEditorOpen(true)
  }

  const handleSave = (payload: EditPayload) => {
    applyEdit(dateKey, payload)
    setSelectedId(null)
    notify('已保存')
  }

  const handlePickStatus = (statusId: string, fromMinute: number) => {
    setStatusFrom(dateKey, fromMinute, statusId)
    const name = statusMap[statusId]?.name ?? '无'
    notify(`已切换为「${name}」`)
  }

  const progressLabels = isToday
    ? { today: '今天', compare: '昨天' }
    : { today: monthDayLabel(dateKey), compare: monthDayLabel(compareKey) }

  return (
    <div className="app">
      <div className="app-shell">
        <Header
          dateKey={dateKey}
          todayKey={todayKey}
          onDateChange={setDateKey}
          theme={theme}
          onThemeChange={setTheme}
          saveState={saveState}
        />

        <main className="app-main">
          {tab === 'today' ? (
            <div className="tab-body">
              {isToday && currentSegment ? (
                <CurrentStatusCard
                  status={currentStatus}
                  segment={currentSegment}
                  nowMinute={currentMinute}
                  yesterdaySameStatus={yesterdaySameStatus}
                  trackedToday={trackedToday}
                  onSwitch={() => setPickerOpen(true)}
                />
              ) : (
                <section className="card day-summary">
                  <div className="day-summary-head">
                    <div>
                      <p className="day-summary-title">
                        {monthDayLabel(dateKey)} · {weekdayLabel(dateKey)}
                      </p>
                      <p className="day-summary-sub">历史记录，可以直接改</p>
                    </div>
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => setDateKey(todayKey)}
                    >
                      回到今天
                    </button>
                  </div>
                  <div className="day-summary-stats">
                    <div>
                      <span className="day-summary-k">已记录</span>
                      <span className="day-summary-v">{formatDuration(stats.tracked)}</span>
                    </div>
                    <div>
                      <span className="day-summary-k">时段数</span>
                      <span className="day-summary-v">
                        {segments.filter((s) => s.statusId !== NONE_STATUS_ID).length} 段
                      </span>
                    </div>
                  </div>
                </section>
              )}

              <Timeline
                segments={segments}
                statusMap={statusMap}
                noneStatus={noneStatus}
                nowMinute={isToday ? currentMinute : null}
                selectedId={selectedId}
                onPick={openEditorAt}
                onAdd={openCreate}
              />

              <StatusProgress
                statuses={statuses}
                todayByStatus={stats.byStatus}
                compareByStatus={compareStats.byStatus}
                todayLabel={progressLabels.today}
                compareLabel={progressLabels.compare}
              />
            </div>
          ) : null}

          {tab === 'stats' ? (
            <StatsTab
              onOpenDay={(key) => {
                setDateKey(key)
                setTab('today')
              }}
            />
          ) : null}

          {tab === 'settings' ? <SettingsTab /> : null}
        </main>

        <nav className="tabbar" aria-label="主导航">
          <button
            type="button"
            className={`tabbar-item${tab === 'today' ? ' is-active' : ''}`}
            onClick={() => setTab('today')}
          >
            <IconCalendar size={21} />
            <span>今日</span>
          </button>
          <button
            type="button"
            className={`tabbar-item${tab === 'stats' ? ' is-active' : ''}`}
            onClick={() => setTab('stats')}
          >
            <IconChartLine size={21} />
            <span>统计</span>
          </button>
          <button
            type="button"
            className={`tabbar-item${tab === 'settings' ? ' is-active' : ''}`}
            onClick={() => setTab('settings')}
          >
            <IconGear size={21} />
            <span>设置</span>
          </button>
        </nav>
      </div>

      <SegmentEditor
        open={editorOpen}
        editing={editing}
        segments={segments}
        statuses={statuses}
        statusMap={statusMap}
        noneStatus={noneStatus}
        initial={editorInitial}
        nowMinute={isToday ? currentMinute : null}
        onClose={() => {
          setEditorOpen(false)
          setSelectedId(null)
        }}
        onSave={handleSave}
      />

      <StatusPicker
        open={pickerOpen}
        statuses={statuses}
        currentStatusId={currentSegment?.statusId ?? NONE_STATUS_ID}
        fromMinute={isToday ? currentMinute : 0}
        onPick={handlePickStatus}
        onClose={() => setPickerOpen(false)}
      />

      {flashMessage ? <div className="toast">{flashMessage}</div> : null}
    </div>
  )
}
