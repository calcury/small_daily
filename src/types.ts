/**
 * 全应用共享的类型定义
 *
 * 核心模型说明：
 *  - 一天被表示为一条从 0 到 1440 分钟（24 小时）的「连续时间轴」
 *  - 时间轴由若干 Segment（区段）无缝铺满，区段之间没有空隙、互不重叠
 *  - 空白时段用内置的「无」状态（NONE_STATUS_ID）表示，默认就是灰色
 *  - 这样任何一次编辑都只是「重涂某段区间」，剩下的交给 normalize 自动补灰 + 合并
 */

/** 内置「无」状态的固定 ID，不可删除 */
export const NONE_STATUS_ID = 'none'

/** 一天的总分钟数 */
export const DAY_MINUTES = 1440

/** 日程状态定义（睡觉 / 休息 / 学习 / 娱乐 / 工作 …，全部可自定义） */
export interface StatusDef {
  id: string
  name: string
  /** CSS 颜色，支持 #rrggbb */
  color: string
  /** 内置状态（「无」）不可删除 */
  builtin?: boolean
}

/** 一个时间段，[start, end) 区间，单位为「当天第几分钟」 */
export interface Segment {
  id: string
  start: number
  end: number
  statusId: string
}

/** 某一天的全部记录 */
export interface DayRecord {
  date: string // YYYY-MM-DD
  segments: Segment[]
  updatedAt: number
}

export type ThemeMode = 'light' | 'dark' | 'system'

/** 本地持久化的完整数据结构（写入 localStorage，永不自动清除） */
export interface AppData {
  version: number
  createdAt: number
  updatedAt: number
  statuses: StatusDef[]
  days: Record<string, DayRecord>
  theme: ThemeMode
  /** 统计图默认展示的天数范围 */
  trendRange: number
}

/** 时段编辑的一次提交 */
export interface EditPayload {
  /** 原始区间（编辑已有区段时传入，用于先清空再重涂） */
  original?: { start: number; end: number }
  start: number
  end: number
  statusId: string
}
