/**
 * 区段逻辑自检脚本（开发用，不参与打包）
 *   node scripts/check-segments.mjs
 * 见 package.json / README 的「自检」说明
 */
import {
  applyRange,
  clearRange,
  clipSegments,
  emptyDay,
  normalize,
  segmentAt,
  totalByStatus,
} from '../src/lib/segments.ts'
import { DAY_MINUTES, NONE_STATUS_ID } from '../src/types.ts'

let passed = 0
let failed = 0

function check(name, condition, extra) {
  if (condition) {
    passed += 1
  } else {
    failed += 1
    console.error(`✗ ${name}`, extra ?? '')
  }
}

function shape(segments) {
  return segments.map((s) => `${s.start}-${s.end}:${s.statusId}`).join(' | ')
}

function assertInvariant(name, segments) {
  let cursor = 0
  for (const seg of segments) {
    if (seg.start !== cursor) {
      check(`${name} · 无空隙`, false, `期望 ${cursor}，实际 ${seg.start} · ${shape(segments)}`)
      return
    }
    if (seg.end <= seg.start) {
      check(`${name} · 区间有效`, false, shape(segments))
      return
    }
    cursor = seg.end
  }
  if (cursor !== DAY_MINUTES) {
    check(`${name} · 铺满全天`, false, `结束于 ${cursor} · ${shape(segments)}`)
    return
  }
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i].statusId === segments[i - 1].statusId) {
      check(`${name} · 相邻同类已合并`, false, shape(segments))
      return
    }
  }
  check(`${name} · 不变式`, true)
}

// ---- 1. 空的一天 ----
const day0 = emptyDay()
check('空的一天是整段「无」', day0.length === 1 && day0[0].start === 0 && day0[0].end === 1440)
assertInvariant('空的一天', day0)

// ---- 2. 涂一段 ----
let a = applyRange(day0, 9 * 60, 12 * 60, 'study')
check('涂 09:00-12:00 学习', shape(a) === '0-540:none | 540-720:study | 720-1440:none', shape(a))

// ---- 3. 中间插入，切成三段 ----
let b = applyRange(a, 10 * 60, 11 * 60, 'rest')
check(
  '在中间插入 10:00-11:00 休息',
  shape(b) === '0-540:none | 540-600:study | 600-660:rest | 660-720:study | 720-1440:none',
  shape(b)
)
assertInvariant('插入后', b)

// ---- 4. 清空中间 → 留出灰色空洞 ----
let c = clearRange(b, 10 * 60, 11 * 60)
check(
  '把 10:00-11:00 改回「无」',
  shape(c) === '0-540:none | 540-600:study | 600-660:none | 660-720:study | 720-1440:none',
  shape(c)
)

// ---- 5. 重新涂回去 → 自动与左右合并 ----
let d = applyRange(c, 10 * 60, 11 * 60, 'study')
check('重新涂回 10:00-11:00 学习后自动合并', shape(d) === shape(a), shape(d))

// ---- 6. 相邻同状态合并 ----
let e = applyRange(applyRange(day0, 0, 60, 'work'), 60, 120, 'work')
check(
  '相邻同状态自动合并成一段',
  e.length === 2 && e[0].start === 0 && e[0].end === 120,
  shape(e)
)

// ---- 7. 缩短区间 → 空出的部分变成「无」 ----
let f = applyRange(day0, 600, 780, 'study')
let g = applyRange(clearRange(f, 600, 780), 600, 720, 'study')
check(
  '缩短 10:00-13:00 → 10:00-12:00，尾部变「无」',
  shape(g) === '0-600:none | 600-720:study | 720-1440:none',
  shape(g)
)

// ---- 8. 跨段覆盖 ----
let h = applyRange(b, 11 * 60, 13 * 60, 'work')
check(
  '11:00-13:00 覆盖到相邻段',
  shape(h) === '0-540:none | 540-600:study | 600-660:rest | 660-780:work | 780-1440:none',
  shape(h)
)

// ---- 9. segmentAt ----
check('segmentAt(540) 落在学习段', segmentAt(a, 540)?.statusId === 'study')
check('segmentAt(539) 落在「无」', segmentAt(a, 539)?.statusId === NONE_STATUS_ID)
check('segmentAt(1439) 落在「无」', segmentAt(a, 1439)?.statusId === NONE_STATUS_ID)

// ---- 10. clipSegments ----
const clipped = clipSegments(a, 600)
check(
  '裁剪到 10:00',
  shape(clipped) === '0-540:none | 540-600:study',
  shape(clipped)
)

// ---- 11. totalByStatus 恒等于 1440 ----
const totals = totalByStatus(b)
const sum = Object.values(totals).reduce((x, y) => x + y, 0)
check('各状态时长之和 = 1440', sum === DAY_MINUTES, String(sum))

// ---- 12. 越界输入 ----
const out = applyRange(day0, -100, 99999, 'fun')
check('越界区间被夹到 [0, 1440]', out.length === 1 && out[0].start === 0 && out[0].end === 1440)

// ---- 13. 随机模糊测试 ----
const STATUSES = ['sleep', 'work', 'study', 'fun', 'rest', NONE_STATUS_ID]
let fuzz = emptyDay()
for (let i = 0; i < 400; i += 1) {
  const s = Math.floor(Math.random() * 1441)
  const len = Math.floor(Math.random() * 600)
  const statusId = STATUSES[Math.floor(Math.random() * STATUSES.length)]
  fuzz = applyRange(fuzz, s, s + len, statusId)
  const cursor = fuzz.reduce((acc, seg) => acc + (seg.end - seg.start), 0)
  if (cursor !== DAY_MINUTES) {
    check(`模糊测试第 ${i} 步铺满全天`, false, shape(fuzz))
    break
  }
}
assertInvariant('400 次随机编辑后', fuzz)
check('随机编辑后仍无空隙', fuzz[0].start === 0 && fuzz[fuzz.length - 1].end === DAY_MINUTES)

// ---- 14. normalize 对乱序 / 重叠输入的鲁棒性 ----
const messy = normalize([
  { id: '1', start: 600, end: 700, statusId: 'work' },
  { id: '2', start: 200, end: 300, statusId: 'study' },
  { id: '3', start: 650, end: 800, statusId: 'fun' },
  { id: '4', start: 100, end: 150, statusId: 'none' },
])
assertInvariant('乱序 + 重叠输入', messy)
check(
  '重叠时按 start 先到先得，其余被裁剪',
  messy.some((s) => s.start === 600 && s.end === 700 && s.statusId === 'work') &&
    messy.some((s) => s.start === 700 && s.end === 800 && s.statusId === 'fun'),
  shape(messy)
)

console.log(`\n通过 ${passed} 项，失败 ${failed} 项`)
process.exit(failed === 0 ? 0 : 1)
