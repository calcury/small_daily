import type { AppData, Segment, StatusDef } from '../types'
import { NONE_STATUS_ID } from '../types'
import { addDays, dateRange, diffDays, nowMinutes } from './time'
import { clipSegments, totalByStatus, trackedMinutes } from './segments'

/** 取出某天的区段（不裁剪，含未来部分） */
export function daySegments(data: AppData, dateKey: string): Segment[] {
  return data.days[dateKey]?.segments ?? []
}

/**
 * 取出某天「已经发生」的区段，用于统计：
 *  - 过去的日期 → 完整一天
 *  - 今天 → 裁剪到当前时刻
 *  - 未来的日期 → 空
 */
export function effectiveSegments(
  data: AppData,
  dateKey: string,
  todayKey: string,
  now: number = nowMinutes()
): Segment[] {
  const delta = diffDays(dateKey, todayKey)
  if (delta > 0) return []
  const segments = daySegments(data, dateKey)
  if (delta === 0) return clipSegments(segments, now)
  return segments
}

export interface StatusStat {
  statusId: string
  minutes: number
  ratio: number
}

export interface DayStat {
  date: string
  byStatus: Record<string, number>
  total: number
  tracked: number
  isEmpty: boolean
}

/** 单日统计 */
export function dayStat(
  data: AppData,
  dateKey: string,
  todayKey: string,
  now: number = nowMinutes()
): DayStat {
  const segments = effectiveSegments(data, dateKey, todayKey, now)
  const byStatus = totalByStatus(segments)
  const total = segments.reduce((acc, s) => acc + (s.end - s.start), 0)
  return {
    date: dateKey,
    byStatus,
    total,
    tracked: trackedMinutes(segments),
    isEmpty: total === 0,
  }
}

/** 连续多日统计（升序） */
export function rangeStats(
  data: AppData,
  from: string,
  to: string,
  todayKey: string,
  now: number = nowMinutes()
): DayStat[] {
  return dateRange(from, to).map((key) => dayStat(data, key, todayKey, now))
}

/** 最近 N 天（含今天） */
export function recentStats(
  data: AppData,
  days: number,
  todayKey: string,
  now: number = nowMinutes()
): DayStat[] {
  const from = addDays(todayKey, -(days - 1))
  return rangeStats(data, from, todayKey, todayKey, now)
}

/**
 * [from, to] 闭区间内每个状态的累计分钟数（升序日历逐日累加）。
 * 今天 / 未来的日子会和单日统计一样按「此刻」裁剪，所以「本周至今」是准的。
 */
export function rangeByStatus(
  data: AppData,
  from: string,
  to: string,
  todayKey: string,
  now: number = nowMinutes()
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const key of dateRange(from, to)) {
    const stat = dayStat(data, key, todayKey, now)
    for (const [statusId, minutes] of Object.entries(stat.byStatus)) {
      out[statusId] = (out[statusId] || 0) + minutes
    }
  }
  return out
}

/** 把状态列表 + 时长整理成图表可直接消费的序列 */
export function toStatusSeries(
  statuses: StatusDef[],
  byStatus: Record<string, number>
): Array<{ status: StatusDef; minutes: number }> {
  return statuses.map((status) => ({ status, minutes: byStatus[status.id] || 0 }))
}

/** 需要出现在图表里的状态：有数据的 + 「无」（若有数据） */
export function chartStatuses(
  statuses: StatusDef[],
  byStatus: Record<string, number>
): StatusDef[] {
  const out = statuses.filter((s) => s.id !== NONE_STATUS_ID && (byStatus[s.id] || 0) > 0)
  if ((byStatus[NONE_STATUS_ID] || 0) > 0) {
    const none = statuses.find((s) => s.id === NONE_STATUS_ID)
    if (none) out.push(none)
  }
  return out
}

/** 一段时间内的平均值 */
export function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** 找出一个状态在某天的第一个区段（用于「今天几点开始学习」这类展示） */
export function firstSegmentOf(segments: Segment[], statusId: string): Segment | undefined {
  return segments.find((s) => s.statusId === statusId)
}

/** 覆盖率：已记录时长 / 已过去时长 */
export function coverage(segments: Segment[]): number {
  const total = segments.reduce((acc, s) => acc + (s.end - s.start), 0)
  if (total === 0) return 0
  return trackedMinutes(segments) / total
}
