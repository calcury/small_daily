/**
 * 无依赖的渲染 + 交互验证脚本（开发用）
 * 用 Chrome DevTools Protocol 打开本地预览，注入示例数据，模拟真实点击与拖动，并截图。
 *
 * 先跑 npm run build && npm run preview，然后：
 *   node scripts/shoot.mjs
 */
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT_DIR = path.join(ROOT, '.preview')
const PROFILE = path.join(ROOT, '.tmp-chrome')
const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const APP_URL = process.env.APP_URL || 'http://localhost:4173/small_daily/'
const PORT = 9333

mkdirSync(OUT_DIR, { recursive: true })
rmSync(PROFILE, { recursive: true, force: true })

const demoBundle = path.join(ROOT, '.tmp-demo.mjs')
execSync(
  `"${path.join(ROOT, 'node_modules', '.bin', 'esbuild.cmd')}" scripts/gen-demo.mjs --bundle --platform=node --format=esm --outfile="${demoBundle}" --log-level=error`,
  { cwd: ROOT, stdio: 'inherit' }
)
const rawDemoJson = execSync(`node "${demoBundle}"`, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 })
  .toString()
  .trim()
rmSync(demoBundle, { force: true })

// 给「今天」换上一份可预期的作息，其中特意留出大段「空」，用来验证：
//   · 点「空」= 整段选中，而不是切一个短事件出来
//   · 今天只能改到「此刻」，斜纹部分（未来）不可编辑
//
// 「此刻」被固定成今天 19:25（见下面的 Date mock），所以断言都是确定的。
const demoData = JSON.parse(rawDemoJson)
const nowDate = new Date()
const pad2 = (n) => String(n).padStart(2, '0')
const TODAY_KEY = `${nowDate.getFullYear()}-${pad2(nowDate.getMonth() + 1)}-${pad2(
  nowDate.getDate()
)}`
const shiftDay = (key, delta) => {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d + delta)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}
const YESTERDAY_KEY = shiftDay(TODAY_KEY, -1)
/** 周一起的一周（和 App 里的 startOfWeek 保持一致） */
const startOfWeekKey = (key) => {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const day = date.getDay() // 0 = 周日
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day))
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}
const WEEK_START = startOfWeekKey(TODAY_KEY)
/** 昨天是否和今天同一周 —— 决定「本周」计划里要不要算上昨天 */
const YESTERDAY_IN_WEEK = YESTERDAY_KEY >= WEEK_START
const NOW_MINUTE = 19 * 60 + 25 // 19:25
const FIXED_MS = new Date(
  nowDate.getFullYear(),
  nowDate.getMonth(),
  nowDate.getDate(),
  Math.floor(NOW_MINUTE / 60),
  NOW_MINUTE % 60,
  0
).getTime()
demoData.days[TODAY_KEY] = {
  date: TODAY_KEY,
  segments: [
    { id: 'fx-sleep', start: 0, end: 4 * 60, statusId: 'sleep' },
    { id: 'fx-gap-am', start: 4 * 60, end: 9 * 60, statusId: 'none' }, // 全在过去
    { id: 'fx-work', start: 9 * 60, end: 12 * 60, statusId: 'work' },
    { id: 'fx-rest', start: 12 * 60, end: 13 * 60, statusId: 'rest' },
    { id: 'fx-gap-pm', start: 13 * 60, end: 20 * 60, statusId: 'none' }, // 横跨 19:25
    { id: 'fx-future', start: 20 * 60, end: 24 * 60, statusId: 'work' }, // 全在未来
  ],
  updatedAt: Date.now(),
}
// 昨天：用来验证时间轴上方那条细的对照轴
demoData.days[YESTERDAY_KEY] = {
  date: YESTERDAY_KEY,
  segments: [
    { id: 'fy-sleep', start: 0, end: 7 * 60, statusId: 'sleep' },
    { id: 'fy-work', start: 9 * 60, end: 18 * 60, statusId: 'work' },
    { id: 'fy-none', start: 18 * 60, end: 24 * 60, statusId: 'none' },
  ],
  updatedAt: Date.now(),
}
// 计划目标：睡觉每天 8h / 每周 50h，工作每天 4h / 每周 20h。
// 配合下面「今天」「昨天」的固定作息，首页进度就是确定值：
//   睡觉：今天 4h（0–4:00）、本周 = 今天 4h (+ 昨天 7h，若同周)
//   工作：今天 3h（9:00–12:00，20:00 之后被「此刻」裁掉）、本周 = 今天 3h (+ 昨天 9h，若同周)
demoData.plans = [
  { id: 'pl-sleep', statusId: 'sleep', dailyMinutes: 8 * 60, weeklyMinutes: 50 * 60 },
  { id: 'pl-work', statusId: 'work', dailyMinutes: 4 * 60, weeklyMinutes: 20 * 60 },
]
// 「本周」必须确定：gen-demo 只给了随机数据，所以把本周内、昨天之前的那些天直接删掉，
// 否则「本周至今」会混进随机值（今天不是周二时就会踩到）。
for (let k = WEEK_START; k < YESTERDAY_KEY; k = shiftDay(k, 1)) delete demoData.days[k]
/** 分钟 → 紧凑时长，和 App 的 formatCompact 一致（4h / 3h20） */
const fmtCompact = (minutes) => {
  const h = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (h === 0) return `${rest}m`
  if (rest === 0) return `${h}h`
  return `${h}h${pad2(rest)}`
}
const TODAY_SLEEP = 4 * 60
const TODAY_WORK = 3 * 60
const WEEK_SLEEP = TODAY_SLEEP + (YESTERDAY_IN_WEEK ? 7 * 60 : 0)
const WEEK_WORK = TODAY_WORK + (YESTERDAY_IN_WEEK ? 9 * 60 : 0)
const demoJson = JSON.stringify(demoData)

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
)

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForDevtools() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      const json = await res.json()
      if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl
    } catch {
      /* 还没起来 */
    }
    await wait(250)
  }
  throw new Error('Chrome DevTools 端口没起来')
}

class CDP {
  constructor(ws) {
    this.ws = ws
    this.seq = 0
    this.pending = new Map()
    this.listeners = new Map()
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
        return
      }
      const list = this.listeners.get(msg.method)
      if (list) for (const fn of list) fn(msg.params, msg.sessionId)
    })
  }

  send(method, params = {}, sessionId) {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, [])
    this.listeners.get(method).push(fn)
  }

  once(method) {
    return new Promise((resolve) => {
      this.on(method, resolve)
      setTimeout(resolve, 15000)
    })
  }
}

const problems = []
const assertions = []

function expect(name, condition, detail) {
  assertions.push({ name, ok: Boolean(condition), detail })
  if (!condition) problems.push(`断言失败：${name}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  const ws = new WebSocket(await waitForDevtools())
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const cdp = new CDP(ws)

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })

  cdp.on('Runtime.exceptionThrown', (p) => {
    problems.push(`未捕获异常: ${p?.exceptionDetails?.exception?.description ?? 'unknown'}`)
  })
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') {
      problems.push(`console.error: ${p.args.map((a) => a.value ?? a.description).join(' ')}`)
    }
  })
  cdp.on('Log.entryAdded', (p) => {
    if (p.entry.level === 'error' && !/favicon|manifest/i.test(p.entry.text)) {
      problems.push(`log: ${p.entry.text}`)
    }
  })
  /** 记录每一次顶层导航的 URL（用来断言「更新版本」真的带 ?v= 重新加载了） */
  const navigations = []
  cdp.on('Page.frameNavigated', (p) => {
    if (p?.frame?.url) navigations.push(p.frame.url)
  })

  await cdp.send('Runtime.enable', {}, sessionId)
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Log.enable', {}, sessionId)

  const setViewport = (width, height) =>
    cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 2, mobile: width < 700 },
      sessionId
    )

  await setViewport(390, 900)

  // 在每个新文档执行前：固定「此刻」+ 注入示例数据
  // 注意：示例数据只在「还没有数据」时写入，否则「退出再进」的持久化验证
  // 会被这份注入脚本覆盖掉，测出来的就是假的。
  await cdp.send(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `
        (() => {
          const Real = Date
          const fixed = ${FIXED_MS}
          function MockDate(...args) {
            return args.length === 0 ? new Real(fixed) : new Real(...args)
          }
          MockDate.now = () => fixed
          MockDate.parse = Real.parse
          MockDate.UTC = Real.UTC
          MockDate.prototype = Real.prototype
          window.Date = MockDate
        })()
        try {
          if (!localStorage.getItem('small-daily:data:v1')) {
            localStorage.setItem('small-daily:data:v1', ${JSON.stringify(demoJson)})
          }
        } catch (e) {}
      `,
    },
    sessionId
  )

  const loaded = cdp.once('Page.loadEventFired')
  await cdp.send('Page.navigate', { url: APP_URL }, sessionId)
  await loaded
  await wait(900)

  async function evaluate(expression) {
    const { result, exceptionDetails } = await cdp.send(
      'Runtime.evaluate',
      { expression: `JSON.stringify(${expression})`, returnByValue: true },
      sessionId
    )
    if (exceptionDetails) throw new Error(exceptionDetails.text)
    return JSON.parse(result.value)
  }

  /** 需要 await 的表达式（比如 caches.keys()） */
  async function evaluateAsync(expression) {
    const { result, exceptionDetails } = await cdp.send(
      'Runtime.evaluate',
      { expression: `(async () => (${expression}))()`, awaitPromise: true, returnByValue: true },
      sessionId
    )
    if (exceptionDetails) throw new Error(exceptionDetails.text)
    return result.value
  }

  async function shoot(name, { clickTab, width, height, full } = {}) {
    if (width) await setViewport(width, height)
    if (clickTab !== undefined) {
      await cdp.send(
        'Runtime.evaluate',
        { expression: `document.querySelectorAll('.tabbar-item')[${clickTab}].click(); 'ok'` },
        sessionId
      )
      await wait(450)
    }
    const { data } = await cdp.send(
      'Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: Boolean(full) },
      sessionId
    )
    writeFileSync(path.join(OUT_DIR, `${name}.png`), Buffer.from(data, 'base64'))
    console.log(`已截图 ${name}.png`)
  }

  /** 真实鼠标事件（浏览器会翻译成 pointer 事件） */
  async function mouse(type, x, y) {
    await cdp.send(
      'Input.dispatchMouseEvent',
      {
        type,
        x,
        y,
        button: 'left',
        buttons: type === 'mouseReleased' ? 0 : 1,
        clickCount: 1,
        pointerType: 'mouse',
      },
      sessionId
    )
    await wait(60)
  }

  await shoot('01-today', { width: 390, height: 900, full: true })
  await shoot('02-today-bottom', { clickTab: 0 })
  await shoot('03-stats', { clickTab: 2, full: true })

  // KPI / 分段控件也应该是「无卡片」的平铺样式
  const flatStyle = await evaluate(`({
    kpiBg: (() => { const el = document.querySelector('.kpi'); return el ? getComputedStyle(el).backgroundColor : null })(),
    kpiDivider: (() => { const el = document.querySelectorAll('.kpi')[1]; return el ? getComputedStyle(el).borderLeftWidth : null })(),
    kpiRadius: (() => { const el = document.querySelector('.kpi'); return el ? getComputedStyle(el).borderTopLeftRadius : null })(),
    segRadius: (() => { const el = document.querySelector('.segmented-item'); return el ? getComputedStyle(el).borderRadius : null })(),
    segActiveBg: (() => { const el = document.querySelector('.segmented-item.is-active'); return el ? getComputedStyle(el).backgroundColor : null })()
  })`)
  console.log('KPI / 分段控件:', JSON.stringify(flatStyle))
  expect(
    'KPI 无卡片外观（透明、无圆角）',
    flatStyle.kpiBg === 'rgba(0, 0, 0, 0)' && flatStyle.kpiRadius === '0px',
    JSON.stringify(flatStyle)
  )
  expect('KPI 之间用竖线分隔', flatStyle.kpiDivider === '1px', String(flatStyle.kpiDivider))
  expect(
    '分段控件改下划线式（无圆角、无选中底色）',
    flatStyle.segRadius === '0px' && flatStyle.segActiveBg === 'rgba(0, 0, 0, 0)',
    JSON.stringify(flatStyle)
  )

  await shoot('04-settings', { clickTab: 3, full: true })
  await shoot('05-desktop', { clickTab: 0, width: 1024, height: 900 })

  // ---------- 首页结构断言 ----------
  await setViewport(390, 900)
  await cdp.send(
    'Runtime.evaluate',
    { expression: `document.querySelectorAll('.tabbar-item')[0].click(); 'ok'` },
    sessionId
  )
  await wait(400)

  const home = await evaluate(`({
    removedSegmentList: document.querySelectorAll('.seg-list, .seg-row, .seg-time').length,
    hasTimeline: !!document.querySelector('.tl-bar'),
    timelineSegments: document.querySelectorAll('.tl-seg').length,
    addButtons: [...document.querySelectorAll('.mini-btn')].map(b => b.textContent.trim()),
    yesterdayTag: document.querySelector('.tl-yesterday-tag')?.textContent ?? null,
    yesterdaySegs: document.querySelectorAll('.tl-yesterday-seg').length,
    yesterdayBar: (() => {
      const el = document.querySelector('.tl-yesterday-bar')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), width: Math.round(r.width) }
    })(),
    mainBar: (() => {
      const el = document.querySelector('.tl-bar')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), width: Math.round(r.width) }
    })(),
    visibleWidthSum: [...document.querySelectorAll('.tl-bar .tl-seg')]
      .reduce((acc, el) => acc + parseFloat(el.style.width || '0'), 0),
    scrollbarWidth: getComputedStyle(document.documentElement).scrollbarWidth,
    hasDateNav: !!document.querySelector('.datenav'),
    proseLeft: ['.tl-hint', '.field-hint', '.data-note', '.about-list', '.danger-note', '.day-summary-sub']
      .filter(sel => document.querySelector(sel) !== null)
  })`)
  console.log('首页结构:', home)
  expect('首页已移除「时段明细」', home.removedSegmentList === 0, String(home.removedSegmentList))
  expect('时间轴仍在', home.hasTimeline)
  expect('时间轴有「添加时段」入口', home.addButtons.includes('添加时段'), home.addButtons.join('/'))
  expect('「今日」保留顶部日期导航', home.hasDateNav === true)

  // 昨天对照条
  expect(
    '时间轴上方有昨日细对照轴，且不写「昨天」两个字',
    home.yesterdayTag === null && home.yesterdaySegs > 0,
    `tag=${home.yesterdayTag} segs=${home.yesterdaySegs}`
  )
  expect(
    '昨天对照条和时间轴左右对齐',
    home.yesterdayBar !== null &&
      home.mainBar !== null &&
      Math.abs(home.yesterdayBar.left - home.mainBar.left) < 2 &&
      Math.abs(home.yesterdayBar.width - home.mainBar.width) < 2,
    `${JSON.stringify(home.yesterdayBar)} vs ${JSON.stringify(home.mainBar)}`
  )

  // 未来留白：画出来的宽度只到「此刻」（19:25 → 80.9%）
  const expectedNowPct = (NOW_MINUTE / 1440) * 100
  expect(
    '今天的时间轴只画到「此刻」，未来留白',
    Math.abs(home.visibleWidthSum - expectedNowPct) < 0.6,
    `画到 ${home.visibleWidthSum.toFixed(2)}%，此刻应在 ${expectedNowPct.toFixed(2)}%`
  )

  // 滚动条
  expect('已隐藏滚动条', home.scrollbarWidth === 'none', String(home.scrollbarWidth))

  // 描述性文本
  expect('描述性 / 说明性文本已清除', home.proseLeft.length === 0, home.proseLeft.join(', '))

  // ---------- 计划：每日 / 每周目标 + 首页进度（取代原「状态进度」） ----------
  const planCard = await evaluate(`({
    hasCard: [...document.querySelectorAll('.card-title')].some(h => h.textContent.trim() === '计划进度'),
    removedOld: document.querySelectorAll('.prog-list, .prog-track, .prog-scale, .legend-swatch').length,
    tabs: [...document.querySelectorAll('.tabbar-item span')].map(s => s.textContent.trim()),
    rows: [...document.querySelectorAll('.plan-item')].map(li => ({
      name: li.querySelector('.plan-name')?.textContent ?? '',
      lines: [...li.querySelectorAll('.plan-line')].map(l => ({
        label: l.querySelector('.plan-line-label')?.textContent ?? '',
        value: l.querySelector('.plan-line-value')?.textContent?.trim() ?? '',
        done: l.classList.contains('is-done')
      }))
    }))
  })`)
  console.log('首页计划进度:', JSON.stringify(planCard))
  expect('首页有「计划进度」板块', planCard.hasCard)
  expect('原「状态进度」已移除', planCard.removedOld === 0, String(planCard.removedOld))
  expect(
    '底部导航为 今日 / 计划 / 统计 / 设置',
    planCard.tabs.join('/') === '今日/计划/统计/设置',
    planCard.tabs.join('/')
  )
  expect(
    '计划进度按状态列出（睡觉 / 工作）',
    planCard.rows.map((r) => r.name).join('/') === '睡觉/工作',
    planCard.rows.map((r) => r.name).join('/')
  )
  expect(
    '睡觉计划进度：今天 / 本周',
    JSON.stringify(planCard.rows[0]?.lines) ===
      JSON.stringify([
        { label: '今天', value: `${fmtCompact(TODAY_SLEEP)}/8h`, done: false },
        { label: '本周', value: `${fmtCompact(WEEK_SLEEP)}/50h`, done: false },
      ]),
    JSON.stringify(planCard.rows[0]?.lines)
  )
  expect(
    '工作计划进度：今天 / 本周',
    JSON.stringify(planCard.rows[1]?.lines) ===
      JSON.stringify([
        { label: '今天', value: `${fmtCompact(TODAY_WORK)}/4h`, done: false },
        { label: '本周', value: `${fmtCompact(WEEK_WORK)}/20h`, done: false },
      ]),
    JSON.stringify(planCard.rows[1]?.lines)
  )
  await shoot('03b-plans-home')

  // 切到「计划」页
  await cdp.send(
    'Runtime.evaluate',
    { expression: `document.querySelectorAll('.tabbar-item')[1].click(); 'ok'` },
    sessionId
  )
  await wait(450)
  const plansTab = await evaluate(`({
    rows: document.querySelectorAll('.plan-edit-row').length,
    statuses: [...document.querySelectorAll('.plan-edit-row .select-input')].map(s => s.value),
    fields: [...document.querySelectorAll('.plan-edit-row .plan-field-label')].map(s => s.textContent.trim()),
    values: [...document.querySelectorAll('.plan-edit-row .plan-num-input')].map(i => i.value),
    hasDateNav: !!document.querySelector('.datenav')
  })`)
  console.log('计划页:', JSON.stringify(plansTab))
  expect('计划页列出两条计划', plansTab.rows === 2, String(plansTab.rows))
  expect('计划页不显示顶部日期', plansTab.hasDateNav === false)
  expect(
    '计划可指定状态 + 每天 / 每周目标',
    plansTab.statuses.join('/') === 'sleep/work' && plansTab.fields.join('/') === '每天/每周/每天/每周',
    `${plansTab.statuses.join('/')} · ${plansTab.fields.join('/')}`
  )
  expect('每天 / 每周目标回填为小时数', plansTab.values.join('/') === '8/50/4/20', plansTab.values.join('/'))
  await shoot('03c-plans-tab', { full: true })

  // 新建一条计划
  await evaluate(
    `(() => { [...document.querySelectorAll('button')].find(b => b.textContent.includes('新建计划'))?.click(); return 'ok' })()`
  )
  await wait(400)
  const afterAddPlan = await evaluate(`({
    rows: document.querySelectorAll('.plan-edit-row').length,
    stored: JSON.parse(localStorage.getItem('small-daily:data:v1')).plans.length
  })`)
  console.log('新建计划后:', JSON.stringify(afterAddPlan))
  expect('「新建计划」能新增一条', afterAddPlan.rows === 3 && afterAddPlan.stored === 3, JSON.stringify(afterAddPlan))

  // 删掉刚加的那条（ConfirmButton 是两步确认，点两下）
  await evaluate(
    `(() => { const rows = document.querySelectorAll('.plan-edit-row'); rows[rows.length - 1].querySelector('.icon-btn--danger')?.click(); return 'ok' })()`
  )
  await wait(150)
  await evaluate(
    `(() => { const rows = document.querySelectorAll('.plan-edit-row'); rows[rows.length - 1].querySelector('.icon-btn--danger')?.click(); return 'ok' })()`
  )
  await wait(400)
  const afterDelPlan = await evaluate(`JSON.parse(localStorage.getItem('small-daily:data:v1')).plans.length`)
  console.log('删除计划后剩余:', afterDelPlan)
  expect('删除计划生效', afterDelPlan === 2, String(afterDelPlan))

  // 把「睡觉」的每天目标改成 4 小时 → 首页应该立刻显示「已完成」
  await evaluate(`(() => {
    const input = document.querySelector('.plan-edit-row .plan-num-input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '4')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return 'ok'
  })()`)
  await wait(500)
  const editedPlan = await evaluate(
    `JSON.parse(localStorage.getItem('small-daily:data:v1')).plans[0].dailyMinutes`
  )
  console.log('睡觉每天目标改为:', editedPlan)
  expect('修改每日目标已落盘', editedPlan === 240, String(editedPlan))

  // 回首页，第一行应该打勾了
  await cdp.send(
    'Runtime.evaluate',
    { expression: `document.querySelectorAll('.tabbar-item')[0].click(); 'ok'` },
    sessionId
  )
  await wait(450)
  const doneLine = await evaluate(`(() => {
    const line = document.querySelector('.plan-item .plan-line')
    return {
      label: line?.querySelector('.plan-line-label')?.textContent ?? null,
      value: line?.querySelector('.plan-line-value')?.textContent?.trim() ?? null,
      done: line?.classList.contains('is-done') ?? false,
      hasCheck: !!line?.querySelector('.plan-check svg')
    }
  })()`)
  console.log('达成后的进度行:', JSON.stringify(doneLine))
  expect('目标达成后标记为已完成（带对勾）', doneLine.done === true && doneLine.hasCheck, JSON.stringify(doneLine))
  expect('达成后显示 4h/4h', doneLine.label === '今天' && doneLine.value === '4h/4h', JSON.stringify(doneLine))

  // 复原成 8h，别影响后面的断言
  await cdp.send(
    'Runtime.evaluate',
    { expression: `document.querySelectorAll('.tabbar-item')[1].click(); 'ok'` },
    sessionId
  )
  await wait(350)
  await evaluate(`(() => {
    const input = document.querySelector('.plan-edit-row .plan-num-input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '8')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return 'ok'
  })()`)
  await wait(400)
  await cdp.send(
    'Runtime.evaluate',
    { expression: `document.querySelectorAll('.tabbar-item')[0].click(); 'ok'` },
    sessionId
  )
  await wait(400)

  // ---------- 小工具 ----------
  /** 按时间轴上的百分比位置点一下 */
  const clickTimelineAt = async (ratio) => {
    const p = await evaluate(`(() => {
      const r = document.querySelector('.tl-bar').getBoundingClientRect()
      return { x: Math.round(r.left + r.width * ${ratio}), y: Math.round(r.top + r.height / 2) }
    })()`)
    await mouse('mousePressed', p.x, p.y)
    await mouse('mouseReleased', p.x, p.y)
    await wait(600)
  }
  const readEditor = () =>
    evaluate(`({
      sheetOpen: !!document.querySelector('.sheet'),
      title: document.querySelector('.sheet-title')?.textContent ?? null,
      activeChip: document.querySelector('.status-chip.is-active')?.textContent?.trim() ?? null,
      range: (() => {
        const bs = document.querySelectorAll('.rtp-readout-time b')
        return { start: bs[0]?.textContent ?? null, end: bs[1]?.textContent ?? null }
      })(),
      selectedPct: parseFloat(document.querySelector('.rtp-selected')?.style.width ?? '0'),
      locked: !!document.querySelector('.rtp-locked'),
      /* 「此刻」在轨道上的百分比，以及背景里最靠右的那块彩色到哪儿（%）。
         今天此刻之后理应留白，所以彩色右边界不能越过此刻 —— 否则就是
         「点空进面板，此刻之后被上一个时间段染色」的那个 bug。 */
      bg: (() => {
        const nowEl = document.querySelector('.rtp-now')
        const nowPct = nowEl ? parseFloat(nowEl.style.left) : null
        const rightEdges = [...document.querySelectorAll('.rtp-bg-seg')]
          .filter((el) => el.style.background && el.style.background !== 'none')
          .map((el) => parseFloat(el.style.left) + parseFloat(el.style.width))
        return {
          nowPct,
          maxColoredRightPct: rightEdges.length ? Math.max(...rightEdges) : 0,
          coloredCount: rightEdges.length,
          segCount: document.querySelectorAll('.rtp-bg-seg').length
        }
      })(),
      footer: [...document.querySelectorAll('.sheet-actions .btn')].map(b => b.textContent.trim())
    })`)
  const closeEditor = async () => {
    await cdp.send(
      'Runtime.evaluate',
      {
        expression: `[...document.querySelectorAll('.sheet-actions .btn')].find(b => b.textContent.includes('取消'))?.click(); 'ok'`,
      },
      sessionId
    )
    await wait(400)
  }

  // ---------- A. 过去的「空」：整段选中，且不切短事件 ----------
  // 04:00–09:00 是空的，点 06:30（27%）
  await clickTimelineAt(0.27)
  const pastGap = await readEditor()
  console.log('A 点过去的大段「空」(06:30):', pastGap.range, `${pastGap.selectedPct}%`)
  expect('点「空」也能打开编辑器', pastGap.sheetOpen)
  expect('「空」被当作事件选中', /无/.test(pastGap.activeChip ?? ''), String(pastGap.activeChip))
  expect(
    '过去的「空」整段选中，没有被切成 1 小时',
    pastGap.range.start === '04:00' && pastGap.range.end === '09:00',
    JSON.stringify(pastGap.range)
  )
  expect(
    '底部只剩「取消 / 保存」，没有多余的「设为无」',
    pastGap.footer.join(' / ') === '取消 / 保存',
    pastGap.footer.join(' / ')
  )
  // 今天：状态是「一路记到 24:00」的，示例数据里 20:00–24:00 就残留了一段 work。
  // 此刻之后的背景必须留白，不能被那段旧状态（= 上一个时间段的颜色）染上色。
  console.log('编辑器背景:', JSON.stringify(pastGap.bg))
  expect(
    '此刻之后的背景不留色（旧的未来段不画出来）',
    pastGap.bg.nowPct !== null && pastGap.bg.maxColoredRightPct <= pastGap.bg.nowPct + 0.01,
    `maxColoredRight=${pastGap.bg.maxColoredRightPct}% now=${pastGap.bg.nowPct}%`
  )
  expect(
    '示例里那段纯未来的 work 不再出现在背景里',
    pastGap.bg.coloredCount === 3,
    `colored=${pastGap.bg.coloredCount} segs=${pastGap.bg.segCount}`
  )
  // 反向自检：先确认示例里真的存在「纯未来」的彩色段（否则上面两条等于没测），
  // 再看背景确实比整天少画了那一段。
  const demoSegs = await evaluate(`(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('small-daily:data:v1'))
      return (raw.days[${JSON.stringify(TODAY_KEY)}]?.segments ?? []).map(s => ({ start: s.start, end: s.end, statusId: s.statusId }))
    } catch (e) { return [] }
  })()`)
  const futureColored = demoSegs.filter((s) => s.statusId !== 'none' && s.start >= NOW_MINUTE)
  expect(
    '示例数据里确实有一段「纯未来」的彩色段（不然上面两条是空测）',
    futureColored.length === 1,
    JSON.stringify(demoSegs)
  )
  expect(
    '背景比整天少画 1 段（正好是被裁掉的那段未来）',
    pastGap.bg.segCount === demoSegs.length - 1,
    `bg=${pastGap.bg.segCount} day=${demoSegs.length}`
  )
  await shoot('05b-editor-none')

  // 5 小时宽的段，正中间离两条线都超过抓取半径：从中间拖必须纹丝不动（已删除平移）
  const midBefore = pastGap.range
  const midPoint = await evaluate(`(() => {
    const r = document.querySelector('.rtp-selected').getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  await mouse('mousePressed', midPoint.x, midPoint.y)
  for (const dx of [-30, -60, -95]) await mouse('mouseMoved', midPoint.x + dx, midPoint.y)
  await mouse('mouseReleased', midPoint.x - 95, midPoint.y)
  await wait(300)
  const midAfter = await readEditor()
  console.log('从区间正中间拖动:', midBefore, '→', midAfter.range)
  expect(
    '中间拖动不再平移时间范围',
    midAfter.range.start === midBefore.start && midAfter.range.end === midBefore.end,
    `${JSON.stringify(midBefore)} → ${JSON.stringify(midAfter.range)}`
  )
  await closeEditor()

  // ---------- B. 横跨「此刻」的「空」：右边界卡在 19:25 ----------
  // 13:00–20:00 横跨此刻，点 15:00（62.5%）
  await clickTimelineAt(0.625)
  const crossGap = await readEditor()
  console.log('B 点横跨此刻的「空」(15:00):', crossGap.range)
  expect('横跨此刻的段也能打开', crossGap.sheetOpen)
  expect(
    '结束时间被卡在「此刻」19:25，而不是 24:00',
    crossGap.range.start === '13:00' && crossGap.range.end === '19:25',
    JSON.stringify(crossGap.range)
  )
  expect('未来区间不再画斜纹（留白）', crossGap.locked === false, String(crossGap.locked))
  await shoot('05c-editor-now-limit')

  // 右分界线往未来拖，也过不去
  const endHandle = await evaluate(`(() => {
    const r = document.querySelector('.rtp-handle--end').getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  await mouse('mousePressed', endHandle.x, endHandle.y)
  for (const dx of [20, 50, 90, 130]) await mouse('mouseMoved', endHandle.x + dx, endHandle.y)
  await mouse('mouseReleased', endHandle.x + 130, endHandle.y)
  await wait(300)
  const crossAfter = await readEditor()
  console.log('B 把右分界线往未来拖:', crossAfter.range)
  expect(
    '拖右分界线也翻不过「此刻」',
    crossAfter.range.end === '19:25',
    JSON.stringify(crossAfter.range)
  )
  await closeEditor()

  // ---------- C. 完全在未来的段：不接受编辑 ----------
  // 20:00–24:00 全在未来，点 21:00（87.5%）
  await clickTimelineAt(0.875)
  const futureTry = await readEditor()
  const blockedToast = await evaluate(`document.querySelector('.toast')?.textContent ?? null`)
  console.log('C 点未来的段(21:00):', { sheetOpen: futureTry.sheetOpen, toast: blockedToast })
  expect('点完全在未来的段不会打开编辑器', futureTry.sheetOpen === false)
  expect('给出「还没到」的提示', /还没到/.test(blockedToast ?? ''), String(blockedToast))
  await shoot('05d-future-blocked')

  // ---------- 点选时间轴 → 打开带拖动分界线的编辑器 ----------
  const barPoint = await evaluate(`(() => {
    const r = document.querySelector('.tl-bar').getBoundingClientRect()
    return { x: Math.round(r.left + r.width * 0.42), y: Math.round(r.top + r.height / 2) }
  })()`)
  await mouse('mousePressed', barPoint.x, barPoint.y)
  await mouse('mouseReleased', barPoint.x, barPoint.y)
  await wait(600)

  const editor = await evaluate(`({
    sheetOpen: !!document.querySelector('.sheet'),
    title: document.querySelector('.sheet-title')?.textContent ?? null,
    handles: document.querySelectorAll('.rtp-handle').length,
    bgSegments: document.querySelectorAll('.rtp-bg-seg').length,
    readout: document.querySelector('.rtp-readout-time')?.textContent ?? null,
    selected: (() => {
      const el = document.querySelector('.rtp-selected')
      if (!el) return null
      const s = el.style
      return { left: s.left, width: s.width }
    })()
  })`)
  console.log('点选时间轴后:', editor)
  expect('点选时间轴打开了编辑器', editor.sheetOpen)
  expect('显示两条可拖动分界线', editor.handles === 2, String(editor.handles))
  expect('背景画出其它时段', editor.bgSegments > 0, String(editor.bgSegments))
  await shoot('06-editor')

  // ---------- 拖动右分界线 ----------
  const before = editor.readout
  const handlePoint = await evaluate(`(() => {
    const r = document.querySelector('.rtp-handle--end').getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)

  await mouse('mousePressed', handlePoint.x, handlePoint.y)
  for (const dx of [-20, -45, -70, -90]) await mouse('mouseMoved', handlePoint.x + dx, handlePoint.y)
  await mouse('mouseReleased', handlePoint.x - 90, handlePoint.y)
  await wait(300)

  const afterDrag = await evaluate(`({
    readout: document.querySelector('.rtp-readout-time')?.textContent ?? null,
    selectedWidth: document.querySelector('.rtp-selected')?.style.width ?? null
  })`)
  console.log('拖动右分界线:', before, '→', afterDrag.readout)
  expect('拖动后时间范围发生变化', afterDrag.readout !== before, `${before} → ${afterDrag.readout}`)
  await shoot('07-editor-dragged')

  // ---------- 窄区间下拖动左分界线（两条线几乎重叠，检验「离哪条近就拖哪条」）----------
  const readRange = () =>
    evaluate(`(() => {
      const bs = document.querySelectorAll('.rtp-readout-time b')
      return { start: bs[0]?.textContent ?? null, end: bs[1]?.textContent ?? null }
    })()`)
  const trackWidth = await evaluate(
    `document.querySelector('.rtp-track')?.getBoundingClientRect().width ?? 0`
  )
  const pxPerMin = trackWidth / 1440
  const rangeBeforeLeft = await readRange()

  const startPoint = await evaluate(`(() => {
    const r = document.querySelector('.rtp-handle--start').getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  // 往左拖 = 把开始时间提前（区间变长）
  const leftDx = Math.round(-180 * pxPerMin)
  await mouse('mousePressed', startPoint.x, startPoint.y)
  for (const k of [0.4, 0.7, 1]) {
    await mouse('mouseMoved', startPoint.x + Math.round(leftDx * k), startPoint.y)
  }
  await mouse('mouseReleased', startPoint.x + leftDx, startPoint.y)
  await wait(300)

  const rangeAfterLeft = await readRange()
  console.log('窄区间下左分界线:', rangeBeforeLeft, '→', rangeAfterLeft)
  expect(
    '重叠时仍能单独拖动左分界线',
    rangeAfterLeft.start !== rangeBeforeLeft.start,
    `${rangeBeforeLeft.start} → ${rangeAfterLeft.start}`
  )
  expect(
    '拖左分界线不会带着右分界线一起跑',
    rangeAfterLeft.end === rangeBeforeLeft.end,
    `${rangeBeforeLeft.end} → ${rangeAfterLeft.end}`
  )
  await shoot('08-editor-both')

  // ---------- 保存后时间轴应被改写 ----------
  const beforeSave = await evaluate(
    `[...document.querySelectorAll('.tl-seg')].map(s => s.style.width).join(',')`
  )
  await cdp.send(
    'Runtime.evaluate',
    { expression: `[...document.querySelectorAll('.sheet-actions .btn')].find(b => b.textContent.includes('保存'))?.click(); 'ok'` },
    sessionId
  )
  await wait(600)
  const afterSave = await evaluate(`({
    sheetOpen: !!document.querySelector('.sheet'),
    widths: [...document.querySelectorAll('.tl-seg')].map(s => s.style.width).join(','),
    toast: document.querySelector('.toast')?.textContent ?? null
  })`)
  console.log('保存结果:', { 关闭: !afterSave.sheetOpen, 提示: afterSave.toast })
  expect('保存后编辑器关闭', !afterSave.sheetOpen)
  expect('时间轴被改写', afterSave.widths !== beforeSave, '宽度分布未变化')
  await shoot('09-after-save', { width: 390, height: 900, full: true })

  // ---------- 日历：点日期区打开、选一天进入、回到今天 ----------
  await cdp.send(
    'Runtime.evaluate',
    { expression: `document.querySelector('.datenav-center').click(); 'ok'` },
    sessionId
  )
  await wait(400)
  const cal = await evaluate(`({
    open: !!document.querySelector('.cal-grid'),
    month: document.querySelector('.cal-month')?.textContent ?? null,
    cells: document.querySelectorAll('.cal-cell:not(.is-blank)').length,
    todayCell: !!document.querySelector('.cal-cell.is-today'),
    dots: document.querySelectorAll('.cal-dot').length
  })`)
  console.log('日历:', cal)
  expect('点中间日期区能打开日历', cal.open)
  expect(
    '日历默认显示当前月份',
    cal.month === `${nowDate.getFullYear()} 年 ${nowDate.getMonth() + 1} 月`,
    String(cal.month)
  )
  expect('日历标出「今天」', cal.todayCell)
  expect('有记录的日子带小圆点', cal.dots > 0, String(cal.dots))
  await shoot('10-calendar')

  // 再按同一个地方（真实鼠标，走命中测试）→ 收起日历
  const navPoint = await evaluate(`(() => {
    const r = document.querySelector('.datenav-center').getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  const clickAt = async (point) => {
    await mouse('mousePressed', point.x, point.y)
    await mouse('mouseReleased', point.x, point.y)
    await wait(400)
  }
  await clickAt(navPoint)
  expect('再按一次日期区会收起日历', (await evaluate(`!!document.querySelector('.cal-grid')`)) === false)

  // 再按一次又能打开（是开关，不是只能开）
  await clickAt(navPoint)
  expect('同一个按钮再按一次又能打开日历', (await evaluate(`!!document.querySelector('.cal-grid')`)) === true)

  // 点抽屉外面那片遮罩同样能收起
  const outsidePoint = await evaluate(`(() => {
    for (let y = 150; y < 420; y += 10) {
      const el = document.elementFromPoint(195, y)
      if (el && el.classList && el.classList.contains('sheet-backdrop')) return { x: 195, y }
    }
    return null
  })()`)
  if (outsidePoint) await clickAt(outsidePoint)
  expect(
    '点抽屉外的遮罩也能收起日历',
    outsidePoint !== null && (await evaluate(`!!document.querySelector('.cal-grid')`)) === false,
    String(JSON.stringify(outsidePoint))
  )

  // 兜底：保证日历回到「打开」，继续后面的流程
  await cdp.send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        if (!document.querySelector('.cal-grid')) document.querySelector('.datenav-center').click()
        return true
      })()`,
    },
    sessionId
  )
  await wait(400)

  const [yy, ymm, yd] = YESTERDAY_KEY.split('-').map(Number)
  const yesterdayLabel = `${ymm} 月 ${yd} 日`
  await cdp.send(
    'Runtime.evaluate',
    {
      expression: `document.querySelector('.cal-cell[aria-label="${YESTERDAY_KEY}"]')?.click(); 'ok'`,
    },
    sessionId
  )
  await wait(450)
  const pastDay = await evaluate(`({
    header: document.querySelector('.datenav-main')?.textContent ?? null,
    calendarClosed: !document.querySelector('.cal-grid'),
    hasJump: !!document.querySelector('.hdr-actions .mini-btn'),
    fullWidthSum: [...document.querySelectorAll('.tl-bar .tl-seg')].reduce((a, el) => a + parseFloat(el.style.width || '0'), 0)
  })`)
  console.log('选到昨天:', pastDay)
  expect('选日期后日历关闭', pastDay.calendarClosed)
  expect('头部切到所选日期', (pastDay.header ?? '').includes(yesterdayLabel), String(pastDay.header))
  expect('出现「回到今天」按钮', pastDay.hasJump)
  expect(
    '历史日期显示完整一天（不再截到此刻）',
    Math.abs(pastDay.fullWidthSum - 100) < 0.6,
    `${pastDay.fullWidthSum.toFixed(2)}%`
  )
  await shoot('11-past-day', { width: 390, height: 900, full: true })

  await cdp.send(
    'Runtime.evaluate',
    { expression: `document.querySelector('.hdr-actions .mini-btn')?.click(); 'ok'` },
    sessionId
  )
  await wait(450)
  const backToday = await evaluate(`({
    sub: document.querySelector('.datenav-sub')?.textContent ?? null,
    hasJump: !!document.querySelector('.hdr-actions .mini-btn'),
    widthSum: [...document.querySelectorAll('.tl-bar .tl-seg')].reduce((a, el) => a + parseFloat(el.style.width || '0'), 0)
  })`)
  console.log('回到今天:', backToday)
  expect(
    '「回到今天」按钮生效',
    (backToday.sub ?? '').includes('今天') && !backToday.hasJump && Math.abs(backToday.widthSum - expectedNowPct) < 0.6,
    JSON.stringify(backToday)
  )

  // ---------- 数据面板：并排两个按钮、无示例数据、清空走弹窗 ----------
  await cdp.send(
    'Runtime.evaluate',
    { expression: `document.querySelectorAll('.tabbar-item')[3].click(); 'ok'` },
    sessionId
  )
  await wait(450)
  const dataPanel = await evaluate(`({
    actions: [...document.querySelectorAll('.data-actions .btn')].map(b => b.textContent.trim()),
    sameRow: (() => {
      const bs = [...document.querySelectorAll('.data-actions .btn')]
      if (bs.length < 2) return false
      const a = bs[0].getBoundingClientRect(), b = bs[1].getBoundingClientRect()
      return Math.abs(a.top - b.top) < 2 && b.left > a.right - 2
    })(),
    hasDemo: [...document.querySelectorAll('button')].some(b => b.textContent.includes('示例数据')),
    builtinTag: [...document.querySelectorAll('.status-manage-list *')].some(el => el.textContent.trim() === '内置'),
    jsonWord: [...document.querySelectorAll('button')].some(b => /json/i.test(b.textContent)),
    hasDateNav: !!document.querySelector('.datenav'),
    brandKept: !!document.querySelector('.brand'),
    sections: [...document.querySelectorAll('.tab-body > *')].map(el => {
      const s = getComputedStyle(el)
      return {
        bg: s.backgroundColor,
        radius: s.borderTopLeftRadius,
        shadow: s.boxShadow,
        top: s.borderTopWidth,
        sides: s.borderLeftWidth + '/' + s.borderRightWidth + '/' + s.borderBottomWidth
      }
    })
  })`)
  console.log('数据面板:', dataPanel)
  expect(
    '导出 / 导入两个按钮',
    dataPanel.actions.join(' / ') === '导出数据 / 导入数据',
    dataPanel.actions.join(' / ')
  )
  expect('导出 / 导入左右并排', dataPanel.sameRow)
  expect('按钮文案不出现 json', dataPanel.jsonWord === false)
  expect('已删除「填充示例数据」', dataPanel.hasDemo === false)
  expect('已删除「内置」标签', dataPanel.builtinTag === false)

  // ---------- 设置页不显示顶部日期 + 无卡片风格 ----------
  expect('设置页不显示顶部日期', dataPanel.hasDateNav === false)
  expect('设置页仍保留品牌与操作区', dataPanel.brandKept === true)
  expect(
    '区块不再是卡片（透明 / 无圆角 / 无阴影）',
    dataPanel.sections.length > 0 &&
      dataPanel.sections.every(
        (s) => s.bg === 'rgba(0, 0, 0, 0)' && s.radius === '0px' && s.shadow === 'none'
      ),
    JSON.stringify(dataPanel.sections)
  )
  expect(
    '区块之间只有一条顶部分隔线（不是四边包围的卡片边框）',
    dataPanel.sections.length > 0 &&
      dataPanel.sections.every(
        (s, index) => s.sides === '0px/0px/0px' && s.top === (index === 0 ? '0px' : '1px')
      ),
    JSON.stringify(dataPanel.sections.map((s) => `${s.top}|${s.sides}`))
  )

  await cdp.send(
    'Runtime.evaluate',
    {
      expression: `[...document.querySelectorAll('button')].find(b => b.textContent.includes('清空全部数据'))?.click(); 'ok'`,
    },
    sessionId
  )
  await wait(350)
  const dialog = await evaluate(`({
    open: !!document.querySelector('.dialog'),
    title: document.querySelector('.dialog-title')?.textContent ?? null,
    buttons: [...document.querySelectorAll('.dialog-actions .btn')].map(b => b.textContent.trim()),
    daysBefore: Object.keys(JSON.parse(localStorage.getItem('small-daily:data:v1')).days).length
  })`)
  console.log('清空弹窗:', dialog)
  expect('清空数据弹出确认弹窗', dialog.open)
  expect('弹窗提供 取消 / 确定', dialog.buttons.join(' / ') === '取消 / 确定清空', dialog.buttons.join(' / '))
  await shoot('12-confirm-dialog')

  await cdp.send(
    'Runtime.evaluate',
    {
      expression: `[...document.querySelectorAll('.dialog-actions .btn')].find(b => b.textContent.includes('取消'))?.click(); 'ok'`,
    },
    sessionId
  )
  await wait(350)
  const afterCancel = await evaluate(`({
    open: !!document.querySelector('.dialog'),
    daysAfter: Object.keys(JSON.parse(localStorage.getItem('small-daily:data:v1')).days).length
  })`)
  console.log('点取消:', afterCancel)
  expect('取消后弹窗关闭', afterCancel.open === false)
  expect('取消不会清掉数据', afterCancel.daysAfter === dialog.daysBefore, `${dialog.daysBefore} → ${afterCancel.daysAfter}`)

  // ---------- 离线 / 持久化：选「睡觉」→ 退出 → 再进 ----------
  await cdp.send(
    'Runtime.evaluate',
    { expression: `document.querySelectorAll('.tabbar-item')[0].click(); 'ok'` },
    sessionId
  )
  await wait(400)
  await cdp.send(
    'Runtime.evaluate',
    { expression: `document.querySelector('.current-main')?.click(); 'ok'` },
    sessionId
  )
  await wait(400)
  const pickerUi = await evaluate(`({
    title: document.querySelector('.sheet-title')?.textContent ?? null,
    hasSwitchFrom: !!document.querySelector('.switch-from'),
    hasTimeInput: !!document.querySelector('.sheet .time-input'),
    items: document.querySelectorAll('.picker-item').length
  })`)
  console.log('切换状态抽屉:', pickerUi)
  expect(
    '「切换状态」里已去掉「从这一刻开始」那一步',
    pickerUi.title === '切换状态' && pickerUi.hasSwitchFrom === false && pickerUi.hasTimeInput === false,
    JSON.stringify(pickerUi)
  )
  await cdp.send(
    'Runtime.evaluate',
    {
      expression: `[...document.querySelectorAll('.picker-item')].find(b => b.textContent.includes('睡觉'))?.click(); 'ok'`,
    },
    sessionId
  )
  await wait(500)
  const afterPick = await evaluate(`(() => {
    const raw = JSON.parse(localStorage.getItem('small-daily:data:v1'))
    const segs = raw.days['${TODAY_KEY}'].segments
    const last = segs[segs.length - 1]
    return {
      currentName: document.querySelector('.current-name')?.textContent ?? null,
      tail: { start: last.start, end: last.end, statusId: last.statusId },
      blankAfterNow: [...document.querySelectorAll('.tl-bar .tl-seg')].reduce((a, el) => a + parseFloat(el.style.width || '0'), 0)
    }
  })()`)
  console.log('选「睡觉」后:', afterPick)
  expect('当前状态切换为「睡觉」', (afterPick.currentName ?? '').includes('睡觉'), String(afterPick.currentName))
  expect(
    '数据里「睡觉」一直记到 24:00（整段时间都标记）',
    afterPick.tail.statusId === 'sleep' && afterPick.tail.start === NOW_MINUTE && afterPick.tail.end === 1440,
    JSON.stringify(afterPick.tail)
  )
  expect(
    '即便如此，时间轴此刻之后仍然留白',
    Math.abs(afterPick.blankAfterNow - expectedNowPct) < 0.6,
    `${afterPick.blankAfterNow.toFixed(2)}%`
  )

  await cdp.send('Network.enable', {}, sessionId)

  // 重新加载（模拟「退出再进」）
  let reloaded = cdp.once('Page.loadEventFired')
  await cdp.send('Page.reload', {}, sessionId)
  await reloaded
  await wait(1100)
  const afterReload = await evaluate(`({
    currentName: document.querySelector('.current-name')?.textContent ?? null,
    hasTimeline: !!document.querySelector('.tl-bar'),
    swController: !!navigator.serviceWorker.controller,
    tail: (() => {
      const raw = JSON.parse(localStorage.getItem('small-daily:data:v1'))
      const segs = raw.days['${TODAY_KEY}'].segments
      const last = segs[segs.length - 1]
      return { start: last.start, end: last.end, statusId: last.statusId }
    })()
  })`)
  console.log('重新进入:', afterReload)
  expect('重新进入后仍是「睡觉」', (afterReload.currentName ?? '').includes('睡觉'), String(afterReload.currentName))
  expect('重新进入后数据仍是睡觉到 24:00', afterReload.tail.statusId === 'sleep' && afterReload.tail.end === 1440, JSON.stringify(afterReload.tail))
  expect('Service Worker 已接管（离线可用的前提）', afterReload.swController)

  // 真正断网，再进一次
  await cdp.send(
    'Network.emulateNetworkConditions',
    { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
    sessionId
  )
  reloaded = cdp.once('Page.loadEventFired')
  await cdp.send('Page.reload', {}, sessionId)
  await reloaded
  await wait(1200)
  const offline = await evaluate(`({
    hasTimeline: !!document.querySelector('.tl-bar'),
    hasRoot: (document.querySelector('#root')?.childElementCount ?? 0) > 0,
    currentName: document.querySelector('.current-name')?.textContent ?? null
  })`)
  console.log('离线重进:', offline)
  expect('离线也能打开（Service Worker 缓存外壳）', offline.hasTimeline && offline.hasRoot)
  expect('离线时「睡觉」记录仍在', (offline.currentName ?? '').includes('睡觉'), String(offline.currentName))
  await shoot('13-offline')

  await cdp.send(
    'Network.emulateNetworkConditions',
    { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
    sessionId
  )

  // ---------- 版本：释放资源重新 fetch，但不动缓存数据 ----------
  await cdp.send(
    'Runtime.evaluate',
    { expression: `document.querySelectorAll('.tabbar-item')[3].click(); 'ok'` },
    sessionId
  )
  await wait(450)
  const versionPanel = await evaluate(`({
    hasCard: [...document.querySelectorAll('.version-card .card-title')].some(h => h.textContent.trim() === '版本'),
    buildHint: document.querySelector('.version-card .card-hint')?.textContent?.trim() ?? null,
    button: document.querySelector('.version-card .btn')?.textContent?.trim() ?? null,
    hasIcon: !!document.querySelector('.version-card .btn svg')
  })`)
  console.log('版本面板:', versionPanel)
  expect('设置里有「版本」板块', versionPanel.hasCard)
  expect(
    '显示当前构建时间',
    /构建于 \d+\/\d+ \d{2}:\d{2}/.test(versionPanel.buildHint ?? ''),
    String(versionPanel.buildHint)
  )
  expect('有「更新版本」按钮', versionPanel.button === '更新版本', String(versionPanel.button))
  expect('更新按钮带刷新图标', versionPanel.hasIcon)
  await shoot('14-version', { full: true })

  // 放一个「别人家的缓存」，验证我们只清自己的
  await evaluateAsync(
    `(await caches.open('unrelated-decoy')).put('/decoy', new Response('decoy')).then(() => true)`
  )
  const beforeUpdate = await evaluateAsync(`({
    caches: (await caches.keys()).length,
    days: Object.keys(JSON.parse(localStorage.getItem('small-daily:data:v1')).days).length,
    search: location.search
  })`)
  console.log('更新前:', beforeUpdate)
  expect('更新前已有外壳缓存（SW 生效）', beforeUpdate.caches > 0, String(beforeUpdate.caches))

  const navMark = navigations.length
  await cdp.send(
    'Runtime.evaluate',
    {
      expression: `[...document.querySelectorAll('button')].find(b => b.textContent.includes('更新版本'))?.click(); 'ok'`,
    },
    sessionId
  )

  const reloadedAfterUpdate = cdp.once('Page.loadEventFired')
  await reloadedAfterUpdate
  await wait(1200)

  const navAfter = navigations.slice(navMark)
  console.log('更新时的导航:', navAfter)
  expect(
    '更新时带缓存击穿参数重新加载',
    navAfter.some((u) => /[?&]v=\d+/.test(u)),
    navAfter.join(' | ')
  )

  const afterUpdate = await evaluateAsync(`({
    hasTimeline: !!document.querySelector('.tl-bar'),
    days: Object.keys(JSON.parse(localStorage.getItem('small-daily:data:v1')).days).length,
    tail: (() => {
      const raw = JSON.parse(localStorage.getItem('small-daily:data:v1'))
      const segs = raw.days['${TODAY_KEY}'].segments
      const last = segs[segs.length - 1]
      return { start: last.start, end: last.end, statusId: last.statusId }
    })(),
    search: location.search,
    decoySurvived: (await caches.keys()).includes('unrelated-decoy')
  })`)
  console.log('更新后:', afterUpdate)
  expect('更新后页面正常渲染', afterUpdate.hasTimeline)
  expect(
    '更新不会动记录（天数不变）',
    afterUpdate.days === beforeUpdate.days,
    `${beforeUpdate.days} → ${afterUpdate.days}`
  )
  expect(
    '更新后「睡觉」记录仍在',
    afterUpdate.tail.statusId === 'sleep' && afterUpdate.tail.end === 1440,
    JSON.stringify(afterUpdate.tail)
  )
  expect('只清自己的缓存，不碰别的缓存', afterUpdate.decoySurvived)
  expect('更新后地址栏的 ?v= 已被清掉', afterUpdate.search === '', JSON.stringify(afterUpdate.search))

  // 外壳缓存已被清空 → SW 重新注册后会再建回来
  let swBack = false
  for (let i = 0; i < 15; i += 1) {
    swBack = await evaluateAsync(`!!(await navigator.serviceWorker.getRegistration())?.active`)
    if (swBack) break
    await wait(300)
  }
  console.log('更新后 SW 重新就绪:', swBack)
  expect('Service Worker 重新注册并激活', swBack)
  await shoot('15-after-update', { width: 390, height: 900, full: true })

  // ---------- 新的一天：开局沿用前一天最后一个事件 ----------
  // 造一份「昨天有记录、今天还空着」的数据，验证第二天一打开就是延续状态。
  const probeData = {
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    statuses: [
      { id: 'sleep', name: '睡觉', color: '#8b5cf6' },
      { id: 'work', name: '工作', color: '#3b82f6' },
      { id: 'none', name: '无', color: '#94a3b8', builtin: true },
    ],
    days: {
      [YESTERDAY_KEY]: {
        date: YESTERDAY_KEY,
        // 结尾是「睡觉」，所以第二天开局应当继承「睡觉」
        segments: [
          { id: 'p-w', start: 0, end: 18 * 60, statusId: 'work' },
          { id: 'p-s', start: 18 * 60, end: 24 * 60, statusId: 'sleep' },
        ],
        updatedAt: Date.now(),
      },
    },
    plans: [],
    theme: 'light',
    trendRange: 7,
  }
  await cdp.send(
    'Runtime.evaluate',
    {
      expression: `localStorage.setItem('small-daily:data:v1', ${JSON.stringify(
        JSON.stringify(probeData)
      )}); 'ok'`,
    },
    sessionId
  )
  await wait(150)
  const seedReload = cdp.once('Page.loadEventFired')
  await cdp.send('Page.reload', {}, sessionId)
  await seedReload
  await wait(1100)

  const seedView = await evaluate(`(() => {
    const raw = JSON.parse(localStorage.getItem('small-daily:data:v1') || 'null')
    const segs = [...document.querySelectorAll('.tl-bar .tl-seg')].map((el) => ({
      w: parseFloat(el.style.width || '0'),
      bg: getComputedStyle(el).backgroundColor
    }))
    const colored = segs.filter((s) => s.bg !== 'rgba(0, 0, 0, 0)')
    return {
      currentName: document.querySelector('.current-name')?.textContent ?? null,
      range: document.querySelector('.current-range')?.textContent?.trim() ?? null,
      todayPersisted: !!(raw && raw.days && raw.days['${TODAY_KEY}']),
      coloredBars: colored.length,
      coloredWidth: colored[0] ? colored[0].w : 0,
      totalBars: segs.length
    }
  })()`)
  console.log('第二天开局:', seedView)
  expect(
    '第二天「此刻正在」= 前一天最后的事件（睡觉）',
    seedView.currentName === '睡觉',
    String(seedView.currentName)
  )
  expect(
    '第二天开局从 0 点延续到此刻（一整段 0 → 19:25）',
    seedView.coloredBars === 1 &&
      Math.abs(seedView.coloredWidth - (NOW_MINUTE / 1440) * 100) < 0.1,
    JSON.stringify({ bars: seedView.coloredBars, w: seedView.coloredWidth })
  )
  expect(
    '延续只是默认值，没编辑就不写盘',
    seedView.todayPersisted === false,
    String(seedView.todayPersisted)
  )
  await shoot('16-next-day-open', { full: true })

  // 从此刻记录「工作」：延续下来的「睡觉」应当自动成为今天的开局
  await cdp.send(
    'Runtime.evaluate',
    { expression: `document.querySelector('.current-main')?.click(); 'ok'` },
    sessionId
  )
  await wait(400)
  await cdp.send(
    'Runtime.evaluate',
    {
      expression: `[...document.querySelectorAll('.picker-item')].find(b => b.textContent.includes('工作'))?.click(); 'ok'`,
    },
    sessionId
  )
  await wait(600)
  const seedAfter = await evaluate(`(() => {
    const raw = JSON.parse(localStorage.getItem('small-daily:data:v1'))
    const segs = raw.days['${TODAY_KEY}'].segments
    const first = segs[0]
    const last = segs[segs.length - 1]
    return {
      first: { start: first.start, end: first.end, statusId: first.statusId },
      last: { start: last.start, end: last.end, statusId: last.statusId }
    }
  })()`)
  console.log('第二天记录后:', seedAfter)
  expect(
    '记录后：昨晚的「睡觉」成为今天的开局（0 → 此刻）',
    seedAfter.first.statusId === 'sleep' &&
      seedAfter.first.start === 0 &&
      seedAfter.first.end === NOW_MINUTE,
    JSON.stringify(seedAfter.first)
  )
  expect(
    '记录后：新事件从此刻接上（此刻 → 24:00）',
    seedAfter.last.statusId === 'work' &&
      seedAfter.last.start === NOW_MINUTE &&
      seedAfter.last.end === 1440,
    JSON.stringify(seedAfter.last)
  )
  await shoot('17-next-day-recorded', { full: true })

  // ---------- 移动端「鬼点」：抽屉弹出的那一瞬间不该误触发里面的控件 ----------
  // 真机上 touchend 之后还会补发一次「兼容性鼠标事件」，落点就是刚才手指的位置；
  // 抽屉已经弹出来了，那一发会正好点在新出现的控件上 —— 原生时间选择器就是这样被点开的。
  await setViewport(390, 600)
  const tapPoint = await evaluate(`(() => {
    const r = document.querySelector('.tl-bar').getBoundingClientRect()
    return { x: Math.round(r.left + r.width * 0.42), y: Math.round(r.top + r.height / 2) }
  })()`)
  await cdp.send(
    'Emulation.setTouchEmulationEnabled',
    { enabled: true, configuration: 'mobile' },
    sessionId
  )
  await cdp.send(
    'Input.dispatchTouchEvent',
    {
      type: 'touchStart',
      touchPoints: [{ x: tapPoint.x, y: tapPoint.y, radiusX: 8, radiusY: 8, force: 1 }],
    },
    sessionId
  )
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId)
  await wait(30)
  // 补发的那一发，落点不变
  await mouse('mousePressed', tapPoint.x, tapPoint.y)
  await mouse('mouseReleased', tapPoint.x, tapPoint.y)
  await wait(500)
  const ghost = await evaluate(`({
    sheetOpen: !!document.querySelector('.sheet'),
    title: document.querySelector('.sheet-title')?.textContent ?? null,
    readout: document.querySelector('.rtp-readout-time')?.textContent ?? null,
    activeIsInput: document.activeElement ? document.activeElement.tagName === 'INPUT' : false,
    activeType: document.activeElement && document.activeElement.getAttribute
      ? document.activeElement.getAttribute('type')
      : null,
    landsOn: (() => {
      const el = document.elementFromPoint(${tapPoint.x}, ${tapPoint.y})
      return el ? (el.className || el.tagName) : null
    })()
  })`)
  console.log('鬼点:', ghost)
  // 点中的是「睡觉 0:00 → 19:25」这一段，鬼点不该把范围改掉任何一点
  const ghostExpected = `00:00→${pad2(Math.floor(NOW_MINUTE / 60))}:${pad2(NOW_MINUTE % 60)}`
  expect(
    '抽屉弹出瞬间的「鬼点」不会误触里面的控件',
    ghost.sheetOpen === true &&
      ghost.readout === ghostExpected &&
      ghost.activeIsInput === false,
    JSON.stringify(ghost)
  )
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }, sessionId)
  await shoot('18-ghost-tap')

  // ---------- 反向自检 ----------
  // 上面那条断言靠一个「落点巧合」：抽屉弹出后，刚才点时间轴的坐标正好压到
  // 「精确到分钟」那一行（log 里的 landsOn）。把守卫撤掉后同一发鬼点必须真的误触，
  // 否则说明落点变了 —— 那条断言其实什么也没验证。
  await cdp.send(
    'Input.dispatchKeyEvent',
    { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    sessionId
  )
  await cdp.send(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    sessionId
  )
  await wait(350)
  await evaluate(
    `(() => {
      const s = document.createElement('style')
      s.textContent = '.sheet-backdrop.is-opening{pointer-events:auto !important}'
      document.head.appendChild(s)
      return true
    })()`
  )
  await cdp.send(
    'Emulation.setTouchEmulationEnabled',
    { enabled: true, configuration: 'mobile' },
    sessionId
  )
  await cdp.send(
    'Input.dispatchTouchEvent',
    {
      type: 'touchStart',
      touchPoints: [{ x: tapPoint.x, y: tapPoint.y, radiusX: 8, radiusY: 8, force: 1 }],
    },
    sessionId
  )
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId)
  await wait(30)
  await mouse('mousePressed', tapPoint.x, tapPoint.y)
  await mouse('mouseReleased', tapPoint.x, tapPoint.y)
  await wait(500)
  const ghostNoGuard = await evaluate(`({
    readout: document.querySelector('.rtp-readout-time')?.textContent ?? null,
    activeIsInput: document.activeElement ? document.activeElement.tagName === 'INPUT' : false
  })`)
  console.log('鬼点(撤掉守卫):', ghostNoGuard)
  expect(
    '反向自检：撤掉守卫后鬼点确实会误触（证明上面那条不是白测的）',
    ghostNoGuard.readout !== ghostExpected || ghostNoGuard.activeIsInput === true,
    `readout=${ghostNoGuard.readout}`
  )
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }, sessionId)

  ws.close()
  chrome.kill()

  console.log('\n断言结果:')
  for (const a of assertions) console.log(` ${a.ok ? '✓' : '✗'} ${a.name}`)
}

main()
  .catch((error) => {
    problems.push(`脚本异常: ${error.stack || error.message}`)
  })
  .finally(() => {
    try {
      chrome.kill()
    } catch {
      /* ignore */
    }
    if (problems.length) {
      console.error('\n发现问题:')
      for (const p of problems) console.error(' -', p)
      process.exit(1)
    }
    console.log('\n全部通过，没有控制台错误')
  })
