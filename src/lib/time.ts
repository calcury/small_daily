import { DAY_MINUTES } from '../types'

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 本地时区的 YYYY-MM-DD */
export function toDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function parseDateKey(key: string): Date {
  const parts = key.split('-').map(Number)
  const y = parts[0] || 1970
  const m = parts[1] || 1
  const d = parts[2] || 1
  return new Date(y, m - 1, d)
}

export function addDays(key: string, delta: number): string {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + delta)
  return toDateKey(d)
}

/** a - b，单位天 */
export function diffDays(a: string, b: string): number {
  const da = parseDateKey(a).getTime()
  const db = parseDateKey(b).getTime()
  return Math.round((da - db) / 86400000)
}

/** 当前时刻是当天第几分钟 */
export function nowMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** 分钟 → HH:MM，1440 显示为 24:00 */
export function minutesToLabel(minutes: number): string {
  const m = Math.max(0, Math.min(DAY_MINUTES, Math.round(minutes)))
  if (m === DAY_MINUTES) return '24:00'
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`
}

/** HH:MM → 分钟，非法返回 null */
export function parseTimeLabel(value: string): number | null {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 24 || m > 59) return null
  const total = h * 60 + m
  if (total > DAY_MINUTES) return null
  return total
}

/** 人话版时长：2 小时 30 分 */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m === 0) return '0 分'
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest} 分`
  if (rest === 0) return `${h} 小时`
  return `${h} 小时 ${rest} 分`
}

/** 紧凑版时长：8h20 */
export function formatCompact(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest}m`
  if (rest === 0) return `${h}h`
  return `${h}h${pad2(rest)}`
}

/** 小时数（保留一位小数，用于图表） */
export function toHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function weekdayLabel(key: string): string {
  return WEEKDAYS[parseDateKey(key).getDay()]
}

export function shortDateLabel(key: string): string {
  const d = parseDateKey(key)
  return `${d.getMonth() + 1}-${pad2(d.getDate())}`
}

export function monthDayLabel(key: string): string {
  const d = parseDateKey(key)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

/** 相对今天的友好描述 */
export function friendlyDate(key: string, todayKey: string): string {
  const delta = diffDays(key, todayKey)
  if (delta === 0) return '今天'
  if (delta === -1) return '昨天'
  if (delta === 1) return '明天'
  if (delta === -2) return '前天'
  return monthDayLabel(key)
}

/** 以周一为一周起点，返回该周的周一 */
export function startOfWeek(key: string): string {
  const d = parseDateKey(key)
  const day = d.getDay() // 0=周日
  const offset = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + offset)
  return toDateKey(d)
}

/** 生成 [from, to] 闭区间内所有日期（升序） */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = []
  const days = diffDays(to, from)
  if (days < 0) return out
  for (let i = 0; i <= days; i += 1) out.push(addDays(from, i))
  return out
}
