import type { Segment } from '../types'
import { DAY_MINUTES, NONE_STATUS_ID } from '../types'
import { newId } from './id'

/** 空的一天：整段都是「无」 */
export function emptyDay(): Segment[] {
  return [{ id: newId('none'), start: 0, end: DAY_MINUTES, statusId: NONE_STATUS_ID }]
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min
  return Math.max(min, Math.min(max, v))
}

/**
 * 规范化一条时间轴 —— 整个编辑能力的基石。
 *
 * 保证输出的不变式：
 *  1. 按 start 升序排列
 *  2. 全部裁剪到 [0, 1440]
 *  3. 无缝铺满一整天：任何空隙自动补成「无」
 *  4. 后出现的区段覆盖先出现的（按时间顺序涂抹）
 *  5. 相邻且状态相同的区段自动合并
 */
export function normalize(input: Segment[]): Segment[] {
  const prepared = input
    .map((s) => ({
      id: s.id || newId(),
      statusId: s.statusId,
      start: clamp(Math.round(s.start), 0, DAY_MINUTES),
      end: clamp(Math.round(s.end), 0, DAY_MINUTES),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const laid: Segment[] = []
  let cursor = 0

  for (const seg of prepared) {
    if (seg.end <= cursor) continue // 完全被前面的区段覆盖
    const start = Math.max(seg.start, cursor)
    if (start > cursor) {
      laid.push({ id: newId('none'), start: cursor, end: start, statusId: NONE_STATUS_ID })
    }
    laid.push({ id: seg.id, start, end: seg.end, statusId: seg.statusId })
    cursor = seg.end
  }

  if (cursor < DAY_MINUTES) {
    laid.push({ id: newId('none'), start: cursor, end: DAY_MINUTES, statusId: NONE_STATUS_ID })
  }

  // 合并相邻同状态
  const merged: Segment[] = []
  for (const seg of laid) {
    const last = merged[merged.length - 1]
    if (last && last.statusId === seg.statusId && last.end === seg.start) {
      last.end = seg.end
      continue
    }
    merged.push({ ...seg })
  }

  return merged
}

/**
 * 把 [start, end) 涂成指定状态：
 * 与它相交的区段会被切开 / 裁剪，缝隙自动补灰，最后统一合并。
 */
export function applyRange(
  segments: Segment[],
  start: number,
  end: number,
  statusId: string
): Segment[] {
  const s = clamp(Math.round(start), 0, DAY_MINUTES)
  const e = clamp(Math.round(end), 0, DAY_MINUTES)
  if (e <= s) return normalize(segments)

  const parts: Segment[] = []
  for (const seg of segments) {
    if (seg.end <= s || seg.start >= e) {
      parts.push({ ...seg })
      continue
    }
    // 左侧残留
    if (seg.start < s) parts.push({ ...seg, id: newId(), end: s })
    // 右侧残留
    if (seg.end > e) parts.push({ ...seg, id: newId(), start: e })
  }
  parts.push({ id: newId(), start: s, end: e, statusId })

  return normalize(parts)
}

/** 把 [start, end) 清成「无」 */
export function clearRange(segments: Segment[], start: number, end: number): Segment[] {
  return applyRange(segments, start, end, NONE_STATUS_ID)
}

/** 找到某一分钟所处的区段 */
export function segmentAt(segments: Segment[], minute: number): Segment | undefined {
  const m = clamp(Math.round(minute), 0, DAY_MINUTES - 1)
  return segments.find((s) => s.start <= m && m < s.end)
}

/** 裁剪到 [0, limit)，用于「今天只统计已经过去的时间」 */
export function clipSegments(segments: Segment[], limit: number): Segment[] {
  const l = clamp(Math.round(limit), 0, DAY_MINUTES)
  return segments
    .map((s) => ({ ...s, end: Math.min(s.end, l) }))
    .filter((s) => s.end > s.start)
}

/** 按状态汇总时长（分钟） */
export function totalByStatus(segments: Segment[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const seg of segments) {
    out[seg.statusId] = (out[seg.statusId] || 0) + (seg.end - seg.start)
  }
  return out
}

/** 已记录（非「无」）的总时长 */
export function trackedMinutes(segments: Segment[]): number {
  return segments.reduce(
    (acc, s) => (s.statusId === NONE_STATUS_ID ? acc : acc + (s.end - s.start)),
    0
  )
}

export function sortByStart(segments: Segment[]): Segment[] {
  return [...segments].sort((a, b) => a.start - b.start)
}
