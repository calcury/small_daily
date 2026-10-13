import type { AppData, DayRecord, Segment, StatusDef, ThemeMode } from '../types'
import { DAY_MINUTES, NONE_STATUS_ID } from '../types'
import { newId } from '../lib/id'
import { normalize } from '../lib/segments'

/**
 * 数据存储层
 *
 * 设计原则：**所有内容自动缓存，且不会自动清除**。
 *  - 每一次改动都会立即写入 localStorage（带防抖，见 ScheduleContext）
 *  - 主键之外额外维护一份「上一版本备份」，写入失败 / JSON 损坏时可回滚
 *  - 不设置任何过期时间、不做任何自动清理
 *  - 提供 JSON 导出 / 导入，方便自己做异地备份
 */

export const DATA_VERSION = 1

const DATA_KEY = 'small-daily:data:v1'
const BACKUP_KEY = 'small-daily:data:v1:backup'
const HISTORY_KEY = 'small-daily:data:v1:history'

export const DEFAULT_STATUSES: StatusDef[] = [
  { id: 'sleep', name: '睡觉', color: '#8b5cf6' },
  { id: 'work', name: '工作', color: '#3b82f6' },
  { id: 'study', name: '学习', color: '#06b6d4' },
  { id: 'fun', name: '娱乐', color: '#f59e0b' },
  { id: 'rest', name: '休息', color: '#10b981' },
  { id: 'sport', name: '运动', color: '#ef4444' },
  { id: NONE_STATUS_ID, name: '无', color: '#94a3b8', builtin: true },
]

/** 备选色板，供自定义颜色时挑选 */
export const COLOR_PALETTE = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#78716c',
  '#94a3b8',
  '#334155',
]

export function createEmptyData(): AppData {
  const now = Date.now()
  return {
    version: DATA_VERSION,
    createdAt: now,
    updatedAt: now,
    statuses: DEFAULT_STATUSES.map((s) => ({ ...s })),
    days: {},
    theme: 'light',
    trendRange: 7,
  }
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value)
}

/** 修数据：任何外部来源（localStorage / 导入文件）都要先过一遍 */
export function sanitize(input: unknown): AppData {
  const base = createEmptyData()
  if (!input || typeof input !== 'object') return base
  const raw = input as Partial<AppData>

  // ---- 状态表 ----
  const seenIds = new Set<string>()
  const statuses: StatusDef[] = []
  if (Array.isArray(raw.statuses)) {
    for (const item of raw.statuses) {
      if (!item || typeof item !== 'object') continue
      const s = item as Partial<StatusDef>
      const id = typeof s.id === 'string' && s.id ? s.id : newId('st')
      if (seenIds.has(id)) continue
      seenIds.add(id)
      statuses.push({
        id,
        name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : '未命名',
        color: isHexColor(s.color) ? s.color : '#94a3b8',
        builtin: id === NONE_STATUS_ID ? true : undefined,
      })
    }
  }

  // 「无」必须存在，且必须是内置状态
  const noneIndex = statuses.findIndex((s) => s.id === NONE_STATUS_ID)
  if (noneIndex === -1) {
    const fallback = DEFAULT_STATUSES[DEFAULT_STATUSES.length - 1]
    statuses.push({ ...fallback })
  } else {
    statuses[noneIndex].builtin = true
  }
  if (statuses.length === 0) statuses.push(...DEFAULT_STATUSES.map((s) => ({ ...s })))

  const validIds = new Set(statuses.map((s) => s.id))

  // ---- 每日记录 ----
  const days: Record<string, DayRecord> = {}
  if (raw.days && typeof raw.days === 'object') {
    for (const [key, value] of Object.entries(raw.days as Record<string, DayRecord>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue
      if (!value || typeof value !== 'object') continue
      const list = Array.isArray(value.segments) ? value.segments : []
      const segments: Segment[] = []
      for (const seg of list) {
        if (!seg || typeof seg !== 'object') continue
        const s = seg as Partial<Segment>
        const start = Number(s.start)
        const end = Number(s.end)
        if (!Number.isFinite(start) || !Number.isFinite(end)) continue
        const statusId = typeof s.statusId === 'string' && validIds.has(s.statusId)
          ? s.statusId
          : NONE_STATUS_ID
        segments.push({
          id: typeof s.id === 'string' && s.id ? s.id : newId(),
          start,
          end,
          statusId,
        })
      }
      days[key] = {
        date: key,
        segments: segments.length ? normalize(segments) : [],
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
      }
    }
  }

  const theme: ThemeMode =
    raw.theme === 'dark' || raw.theme === 'system' || raw.theme === 'light' ? raw.theme : 'light'

  const trendRange = [7, 14, 30].includes(Number(raw.trendRange)) ? Number(raw.trendRange) : 7

  return {
    version: DATA_VERSION,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : base.updatedAt,
    statuses,
    days,
    theme,
    trendRange,
  }
}

function safeParse(text: string | null): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (err) {
    console.warn('[small_daily] 数据解析失败，将尝试使用备份', err)
    return null
  }
}

/** 读取数据：主键 → 备份 → 全新 */
export function loadData(): AppData {
  if (typeof localStorage === 'undefined') return createEmptyData()

  const primary = safeParse(localStorage.getItem(DATA_KEY))
  if (primary) return sanitize(primary)

  const backup = safeParse(localStorage.getItem(BACKUP_KEY))
  if (backup) {
    const restored = sanitize(backup)
    console.warn('[small_daily] 已从备份恢复数据')
    persist(restored, { rotateBackup: false })
    return restored
  }

  return createEmptyData()
}

interface PersistOptions {
  rotateBackup?: boolean
}

/** 写入数据（同步、立即生效） */
export function persist(data: AppData, options: PersistOptions = {}): boolean {
  const { rotateBackup = true } = options
  if (typeof localStorage === 'undefined') return false

  let payload: string
  try {
    payload = JSON.stringify(data)
  } catch (err) {
    console.warn('[small_daily] 数据序列化失败', err)
    return false
  }

  try {
    const previous = localStorage.getItem(DATA_KEY)
    if (rotateBackup && previous && previous !== payload) {
      localStorage.setItem(BACKUP_KEY, previous)
    }
    localStorage.setItem(DATA_KEY, payload)

    // 记录最近一次成功写入的历史时间戳，用于「数据安全」面板展示
    const history = safeParse(localStorage.getItem(HISTORY_KEY))
    const list = Array.isArray(history) ? (history as number[]) : []
    list.push(Date.now())
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-20)))
    return true
  } catch (err) {
    console.warn('[small_daily] 写入 localStorage 失败（可能是空间已满）', err)
    return false
  }
}

export function exportData(data: AppData): string {
  return JSON.stringify(data, null, 2)
}

/** 解析导入文件 */
export function parseImport(text: string): AppData {
  const parsed = safeParse(text)
  if (!parsed) throw new Error('文件内容不是合法的 JSON')
  const data = sanitize(parsed)
  if (Object.keys(data.days).length === 0 && data.statuses.length === 0) {
    throw new Error('文件里没有找到可用的日程数据')
  }
  return data
}

export function lastWriteHistory(): number[] {
  if (typeof localStorage === 'undefined') return []
  const history = safeParse(localStorage.getItem(HISTORY_KEY))
  return Array.isArray(history) ? (history as number[]).filter((n) => typeof n === 'number') : []
}

export interface StorageUsage {
  bytes: number
  quotaBytes: number | null
  dayCount: number
}

export async function storageUsage(data: AppData): Promise<StorageUsage> {
  let bytes = 0
  try {
    bytes = new Blob([JSON.stringify(data)]).size
  } catch (err) {
    bytes = 0
  }

  let quotaBytes: number | null = null
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate()
      quotaBytes = estimate.quota ?? null
    }
  } catch (err) {
    quotaBytes = null
  }

  return { bytes, quotaBytes, dayCount: Object.keys(data.days).length }
}

/** 危险操作：清空全部数据（需要用户二次确认后才会被调用） */
export function wipeAll(): void {
  if (typeof localStorage === 'undefined') return
  const current = localStorage.getItem(DATA_KEY)
  if (current) {
    // 清空前留一份备份，永远给用户一条后路
    localStorage.setItem(BACKUP_KEY, current)
  }
  localStorage.removeItem(DATA_KEY)
  localStorage.removeItem(HISTORY_KEY)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export { DATA_KEY, BACKUP_KEY, DAY_MINUTES }
