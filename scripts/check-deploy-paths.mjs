/**
 * 部署产物守卫：确保 dist 里没有任何指向「站点根路径」的引用。
 *
 * 这个仓库发布在 https://calcury.github.io/small_daily/ 这个「项目子路径」下，
 * 而 calcury.github.io 的根目录属于另一个仓库（用户站）。
 * 一旦产物里出现 "/xxx" 这种根路径引用，浏览器会跑到别的站点根目录去取文件 ——
 * 轻则 404，重则加载到别的仓库的内容，互相打架。
 *
 * 所以这里做两道检查：
 *   1. 所有绝对引用都必须以 /small_daily/ 开头
 *   2. index.html 引用到的本地文件必须真的存在于 dist
 *
 * 用法：node scripts/check-deploy-paths.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/** 生产构建的固定子路径，与 vite.config.ts 保持一致 */
const BASE = '/small_daily/'
const DIST = path.resolve(import.meta.dirname, '..', 'dist')

const TEXT_EXT = new Set(['.html', '.js', '.css', '.webmanifest', '.json', '.svg'])
const PATTERNS = [
  /(?:src|href)\s*=\s*["'](\/[^"']*)["']/g, // <script src="/x">  <link href="/x">
  /url\(\s*["']?(\/[^"')]*)["']?\s*\)/g, // CSS url(/x)
]

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

if (!existsSync(DIST)) {
  console.error(`✗ 找不到构建产物目录：${DIST}（请先执行 npm run build）`)
  process.exit(1)
}

const problems = []

for (const file of walk(DIST)) {
  if (!TEXT_EXT.has(path.extname(file))) continue
  const rel = path.relative(DIST, file).replace(/\\/g, '/')
  const text = readFileSync(file, 'utf8')
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      const url = match[1]
      if (url.startsWith('//')) continue // 协议相对地址，与本仓库无关
      if (url.startsWith(BASE)) continue // 正确：挂在 /small_daily/ 下
      problems.push(`${rel} → ${url}`)
    }
  }
}

// 入口页引用的本地文件必须真的存在，避免再次出现 404
const html = readFileSync(path.join(DIST, 'index.html'), 'utf8')
for (const match of html.matchAll(/["'](\/small_daily\/[^"']+)["']/g)) {
  const target = path.join(DIST, match[1].slice(BASE.length))
  if (!existsSync(target)) problems.push(`index.html 引用了不存在的文件 → ${match[1]}`)
}

if (problems.length) {
  console.error('✗ 部署产物里发现指向站点根路径（或缺失）的引用：')
  for (const p of problems) console.error('  -', p)
  console.error(`\n这些都会跑到 calcury.github.io 的根目录上去，可能和别的仓库冲突。`)
  console.error(`请一律改成带 ${BASE} 前缀（HTML 里可用 %BASE_URL%）。`)
  process.exit(1)
}

console.log(`✓ 所有引用都在 ${BASE} 下，且被引用的文件都存在`)
