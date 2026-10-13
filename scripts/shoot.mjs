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
const demoJson = execSync(`node "${demoBundle}"`, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 })
  .toString()
  .trim()
rmSync(demoBundle, { force: true })

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

  // 在每个新文档执行前注入示例数据
  await cdp.send(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `try { localStorage.setItem('small-daily:data:v1', ${JSON.stringify(demoJson)}) } catch (e) {}`,
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
  await shoot('03-stats', { clickTab: 1, full: true })
  await shoot('04-settings', { clickTab: 2, full: true })
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
    addButtons: [...document.querySelectorAll('.mini-btn')].map(b => b.textContent.trim())
  })`)
  console.log('首页结构:', home)
  expect('首页已移除「时段明细」', home.removedSegmentList === 0, String(home.removedSegmentList))
  expect('时间轴仍在', home.hasTimeline)
  expect('时间轴有「添加时段」入口', home.addButtons.includes('添加时段'), home.addButtons.join('/'))

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
