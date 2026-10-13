import { useEffect, useMemo, useState } from 'react'
import { NONE_STATUS_ID } from '../types'
import { useNow } from '../hooks/useNow'
import { useSchedule } from '../store/ScheduleContext'
import { chartStatuses, recentStats, toStatusSeries } from '../lib/stats'
import {
  formatCompact,
  formatDuration,
  friendlyDate,
  monthDayLabel,
  nowMinutes,
  shortDateLabel,
  toDateKey,
  toHours,
  weekdayLabel,
} from '../lib/time'
import { DonutChart, RankBars } from './charts/Charts'
import { TrendChart, type TrendSeries } from './charts/TrendChart'
import { Segmented } from './Sheet'

interface StatsTabProps {
  onOpenDay: (dateKey: string) => void
}

const RANGE_OPTIONS = [
  { value: 7, label: '近 7 天' },
  { value: 14, label: '近 14 天' },
  { value: 30, label: '近 30 天' },
]

export function StatsTab({ onOpenDay }: StatsTabProps) {
  const { data, statuses, statusMap, noneStatus, trendRange, setTrendRange } = useSchedule()
  const now = useNow(60000)
  const todayKey = toDateKey(now)
  const currentMinute = nowMinutes(now)

  const [mode, setMode] = useState<'line' | 'stack'>('line')
  const [detailDate, setDetailDate] = useState(todayKey)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  useEffect(() => {
    setDetailDate((prev) => (prev > todayKey ? todayKey : prev))
  }, [todayKey])

  const stats = useMemo(
    () => recentStats(data, trendRange, todayKey, currentMinute),
    [data, trendRange, todayKey, currentMinute]
  )

  const labels = stats.map((day) => shortDateLabel(day.date))
  const subLabels = stats.map((day) => weekdayLabel(day.date))

  /** 趋势图序列：不包含「无」，只看真正记录过的状态 */
  const trendStatuses = useMemo(() => {
    const anyData: Record<string, number> = {}
    for (const day of stats) {
      for (const [id, minutes] of Object.entries(day.byStatus)) {
        anyData[id] = (anyData[id] || 0) + minutes
      }
    }
    return statuses.filter((s) => s.id !== NONE_STATUS_ID && (anyData[s.id] || 0) > 0)
  }, [stats, statuses])

  const series: TrendSeries[] = useMemo(
    () =>
      trendStatuses.map((status) => ({
        id: status.id,
        name: status.name,
        color: status.color,
        values: stats.map((day) => day.byStatus[status.id] || 0),
      })),
    [trendStatuses, stats]
  )

  const totalsByStatus = useMemo(() => {
    const out: Record<string, number> = {}
    for (const day of stats) {
      for (const [id, minutes] of Object.entries(day.byStatus)) {
        out[id] = (out[id] || 0) + minutes
      }
    }
    return out
  }, [stats])

  const activeDays = stats.filter((day) => day.tracked > 0).length
  const avgTracked = stats.length
    ? stats.reduce((acc, day) => acc + day.tracked, 0) / stats.length
    : 0

  const topStatus = useMemo(() => {
    let best: { status: (typeof statuses)[number]; minutes: number } | null = null
    for (const status of statuses) {
      if (status.id === NONE_STATUS_ID) continue
      const minutes = totalsByStatus[status.id] || 0
      if (minutes > 0 && (!best || minutes > best.minutes)) best = { status, minutes }
    }
    return best
  }, [statuses, totalsByStatus])

  const detailStat = useMemo(
    () => stats.find((day) => day.date === detailDate) ?? stats[stats.length - 1],
    [stats, detailDate]
  )

  const detailItems = useMemo(() => {
    if (!detailStat) return []
    return chartStatuses(statuses, detailStat.byStatus).map((status) => ({
      id: status.id,
      name: status.name,
      color: status.color,
      value: detailStat.byStatus[status.id] || 0,
    }))
  }, [detailStat, statuses])

  // detailDate 不在当前范围内时，回落到范围内最后一天
  useEffect(() => {
    if (stats.length === 0) return
    if (!stats.some((day) => day.date === detailDate)) {
      setDetailDate(stats[stats.length - 1].date)
      setSelectedIndex(stats.length - 1)
    }
  }, [stats, detailDate])

  const rangeTotal = stats.reduce((acc, day) => acc + day.tracked, 0)

  return (
    <div className="tab-body">
      <section className="kpi-grid">
        <div className="kpi">
          <span className="kpi-k">日均记录</span>
          <span className="kpi-v">{formatCompact(avgTracked)}</span>
          <span className="kpi-sub">近 {trendRange} 天</span>
        </div>
        <div className="kpi">
          <span className="kpi-k">有记录的天数</span>
          <span className="kpi-v">
            {activeDays}
            <em>/{trendRange}</em>
          </span>
          <span className="kpi-sub">累计 {formatCompact(rangeTotal)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-k">投入最多</span>
          <span className="kpi-v kpi-v--status">
            {topStatus ? (
              <>
                <span className="kpi-dot" style={{ background: topStatus.status.color }} />
                {topStatus.status.name}
              </>
            ) : (
              '—'
            )}
          </span>
          <span className="kpi-sub">
            {topStatus ? `共 ${formatDuration(topStatus.minutes)}` : '暂无数据'}
          </span>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">趋势</h2>
          <Segmented
            size="sm"
            value={mode}
            onChange={(value) => setMode(value)}
            options={[
              { value: 'line' as const, label: '曲线' },
              { value: 'stack' as const, label: '堆叠' },
            ]}
          />
        </div>

        <div className="range-row">
          <Segmented
            size="sm"
            value={trendRange}
            onChange={setTrendRange}
            options={RANGE_OPTIONS}
          />
        </div>

        <TrendChart
          labels={labels}
          subLabels={subLabels}
          series={series}
          mode={mode}
          height={232}
          selectedIndex={selectedIndex}
          onSelectIndex={(index) => {
            setSelectedIndex(index)
            const day = stats[index]
            if (day) setDetailDate(day.date)
          }}
        />

        {series.length === 0 ? (
          <p className="empty-note">这段时间还没有记录，先去「今日」记几笔吧。</p>
        ) : null}

        <div className="chart-legend">
          {series.map((item) => {
            const total = totalsByStatus[item.id] || 0
            return (
              <span className="chart-legend-item" key={item.id}>
                <span className="chart-legend-dot" style={{ background: item.color }} />
                {item.name}
                <b>{formatCompact(total)}</b>
              </span>
            )
          })}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">{friendlyDate(detailStat?.date ?? detailDate, todayKey)}的分布</h2>
          <span className="card-hint">{monthDayLabel(detailStat?.date ?? detailDate)}</span>
        </div>

        <div className="donut-row">
          <DonutChart
            items={detailItems}
            centerTop={detailStat ? (detailStat.date === todayKey ? '截至现在' : '全天') : '—'}
            centerMain={formatCompact((detailStat?.tracked ?? 0))}
          />
          <div className="donut-legend">
            {detailItems.length === 0 ? (
              <p className="empty-note">没有记录。</p>
            ) : (
              detailItems.map((item) => {
                const total = detailStat?.total || 0
                const percent = total > 0 ? Math.round((item.value / total) * 100) : 0
                return (
                  <div className="donut-legend-row" key={item.id}>
                    <span className="chart-legend-dot" style={{ background: item.color }} />
                    <span className="donut-legend-name">{item.name}</span>
                    <span className="donut-legend-value">{formatCompact(item.value)}</span>
                    <span className="donut-legend-percent">{percent}%</span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {detailStat && detailStat.date !== todayKey ? (
          <button
            type="button"
            className="ghost-btn"
            onClick={() => onOpenDay(detailStat.date)}
          >
            去修改 {monthDayLabel(detailStat.date)} 的记录
          </button>
        ) : null}
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">时长排行</h2>
          <span className="card-hint">近 {trendRange} 天累计</span>
        </div>
        <RankBars
          items={statuses.map((status) => ({
            id: status.id,
            name: status.name,
            color: status.color,
            value: totalsByStatus[status.id] || 0,
          }))}
          formatValue={(value) => `${toHours(value)}h`}
        />
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">每日明细</h2>
        </div>
        <ul className="daysum-list">
          {[...stats].reverse().map((day) => {
            const items = toStatusSeries(statuses, day.byStatus).filter((item) => item.minutes > 0)
            return (
              <li key={day.date} className="daysum-row">
                <div className="daysum-head">
                  <span className="daysum-date">
                    {monthDayLabel(day.date)}
                    <i>{weekdayLabel(day.date)}</i>
                    {day.date === todayKey ? <em>今天</em> : null}
                  </span>
                  <span className="daysum-total">
                    {day.tracked > 0 ? formatCompact(day.tracked) : '无记录'}
                  </span>
                </div>
                <div className="daysum-bar">
                  {items.map((item) => {
                    const status = statusMap[item.status.id] ?? noneStatus
                    return (
                      <span
                        key={item.status.id}
                        className="daysum-bar-seg"
                        style={{
                          width: `${(item.minutes / 1440) * 100}%`,
                          background: status.color,
                        }}
                        title={`${status.name} ${formatDuration(item.minutes)}`}
                      />
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
