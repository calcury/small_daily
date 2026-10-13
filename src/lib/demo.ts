import type { AppData, Segment } from '../types'
import { applyRange, emptyDay } from './segments'
import { addDays, toDateKey } from './time'

/** 一份作息模板：(开始, 结束, 状态) —— 分钟为单位 */
const ROUTINE: Array<[number, number, string]> = [
  [0, 7 * 60, 'sleep'],
  [7 * 60, 7 * 60 + 30, 'rest'],
  [7 * 60 + 30, 8 * 60 + 30, 'study'],
  [8 * 60 + 30, 9 * 60, 'rest'],
  [9 * 60, 12 * 60, 'work'],
  [12 * 60, 13 * 60, 'rest'],
  [13 * 60, 14 * 60, 'fun'],
  [14 * 60, 18 * 60, 'work'],
  [18 * 60, 19 * 60, 'sport'],
  [19 * 60, 20 * 60, 'rest'],
  [20 * 60, 22 * 60, 'study'],
  [22 * 60, 23 * 60, 'fun'],
  [23 * 60, 24 * 60, 'sleep'],
]

function jitter(minutes: number, amount: number): number {
  return minutes + Math.round((Math.random() * 2 - 1) * amount)
}

function buildDay(dateKey: string, isWeekend: boolean): Segment[] {
  let segments = emptyDay()
  for (const [start, end, statusId] of ROUTINE) {
    let s = jitter(start, 20)
    let e = jitter(end, 20)
    // 周末把工作换成娱乐
    const finalStatus = isWeekend && statusId === 'work' ? 'fun' : statusId
    if (isWeekend && statusId === 'sleep' && start === 0) {
      e = jitter(8 * 60 + 30, 45)
    }
    if (isWeekend && statusId === 'study' && start >= 20 * 60) {
      continue
    }
    if (s < 0) s = 0
    if (e > 1440) e = 1440
    if (e <= s) continue
    segments = applyRange(segments, s, e, finalStatus)
  }
  return segments
}

/**
 * 生成最近 N 天的示例数据。
 * 只填「目前还是空白」的日期，不会覆盖你已有的记录。
 */
export function withDemoData(data: AppData, days = 7): { data: AppData; added: number } {
  const today = toDateKey()
  const next: AppData = { ...data, days: { ...data.days } }
  let added = 0

  for (let i = 0; i < days; i += 1) {
    const key = addDays(today, -i)
    const existing = next.days[key]
    if (existing && existing.segments.some((s) => s.statusId !== 'none')) continue
    const weekday = new Date(key.replace(/-/g, '/')).getDay()
    const isWeekend = weekday === 0 || weekday === 6
    next.days[key] = {
      date: key,
      segments: buildDay(key, isWeekend),
      updatedAt: Date.now(),
    }
    added += 1
  }

  return { data: { ...next, updatedAt: Date.now() }, added }
}
