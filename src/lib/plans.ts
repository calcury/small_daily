/**
 * 计划相关的纯逻辑：目标时长的规整 + 进度行的拼装。
 * 这里不碰任何 React / DOM，方便复用与单独推理。
 */
import type { PlanTarget, StatusDef } from '../types'
import { NONE_STATUS_ID } from '../types'

/** 每日目标上限：一整天 */
export const MAX_DAILY_MINUTES = 24 * 60
/** 每周目标上限：一整周 */
export const MAX_WEEKLY_MINUTES = 7 * 24 * 60

/**
 * 目标时长规整：非法值、负数、0 一律当作「不设」（返回 0），超过上限则夹到上限。
 * 传入的可能是用户随手敲出来的字符串，所以先过一遍 Number。
 */
export function toTargetMinutes(value: unknown, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(Math.round(n), max)
}

/** 把一个计划的两项目标都规整一遍 */
export function sanitizeTarget(plan: Pick<PlanTarget, 'dailyMinutes' | 'weeklyMinutes'>): {
  dailyMinutes: number
  weeklyMinutes: number
} {
  return {
    dailyMinutes: toTargetMinutes(plan.dailyMinutes, MAX_DAILY_MINUTES),
    weeklyMinutes: toTargetMinutes(plan.weeklyMinutes, MAX_WEEKLY_MINUTES),
  }
}

/** 计划在某一天 / 某一周的实际完成情况 */
export interface PlanProgressRow {
  plan: PlanTarget
  status: StatusDef
  /** 当天已经记录的分钟 */
  dayMinutes: number
  /** 本周（周一起）已经记录的分钟 */
  weekMinutes: number
}

/**
 * 拼出首页要展示的进度行：
 *  - 跳过「无」状态、以及两项目标都没设的计划（没必要占位置）
 *  - 跳过状态已被删除的计划（理论上不该存在，防御一下）
 */
export function buildPlanRows(
  plans: PlanTarget[],
  statusMap: Record<string, StatusDef>,
  dayByStatus: Record<string, number>,
  weekByStatus: Record<string, number>
): PlanProgressRow[] {
  const rows: PlanProgressRow[] = []
  for (const plan of plans) {
    if (plan.dailyMinutes <= 0 && plan.weeklyMinutes <= 0) continue
    const status = statusMap[plan.statusId]
    if (!status || status.id === NONE_STATUS_ID) continue
    rows.push({
      plan,
      status,
      dayMinutes: dayByStatus[plan.statusId] || 0,
      weekMinutes: weekByStatus[plan.statusId] || 0,
    })
  }
  return rows
}

/** 完成度：0–1，目标为 0 时返回 0 */
export function completion(value: number, target: number): number {
  if (target <= 0) return 0
  return Math.max(0, Math.min(1, value / target))
}
