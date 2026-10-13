/**
 * 版本更新：把应用外壳（HTML / JS / CSS）整份重新拉一遍。
 *
 * 只动「资源缓存」与 Service Worker —— **绝不触碰 localStorage 里的日程数据**。
 * 流程：清掉本应用的外壳缓存 → 注销 Service Worker → 带缓存击穿参数重新加载。
 * 这样连浏览器自身的 HTTP 缓存（GitHub Pages 上 max-age=600）也一起绕过去了。
 */

/** 外壳缓存前缀，与 public/sw.js 里的 SHELL_PREFIX 保持一致 */
const SHELL_PREFIX = 'small_daily-shell-'

/** 重新拉取时用的缓存击穿参数名 */
export const RELOAD_FLAG = 'v'

/** 清掉本应用自己的外壳缓存（不碰别的站点 / 别的仓库的缓存） */
export async function clearShellCaches(): Promise<number> {
  if (typeof caches === 'undefined') return 0
  const keys = await caches.keys()
  const mine = keys.filter((key) => key.startsWith(SHELL_PREFIX))
  await Promise.all(mine.map((key) => caches.delete(key).catch(() => false)))
  return mine.length
}

/** 注销当前作用域下的 Service Worker，让下次加载重新安装一份 */
export async function unregisterServiceWorkers(): Promise<number> {
  if (!('serviceWorker' in navigator)) return 0
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((reg) => reg.unregister().catch(() => false)))
  return registrations.length
}

/** 带缓存击穿参数重新加载当前页面（走 location.replace，不留历史记录） */
export function reloadWithCacheBust(): void {
  const url = new URL(window.location.href)
  url.searchParams.set(RELOAD_FLAG, String(Date.now()))
  window.location.replace(url.toString())
}

/** 把地址栏里的击穿参数抹掉，免得它一直留在收藏 / 分享出去的链接里 */
export function stripReloadFlag(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has(RELOAD_FLAG)) return
  url.searchParams.delete(RELOAD_FLAG)
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

/** 释放资源：清缓存 + 注销 SW。返回各自清掉了多少 */
export async function releaseResources(): Promise<{ caches: number; workers: number }> {
  const workers = await unregisterServiceWorkers()
  const cachesCleared = await clearShellCaches()
  return { caches: cachesCleared, workers }
}

/** 组合动作：释放资源 → 重新加载（调用后页面会立刻刷新） */
export async function updateVersion(): Promise<void> {
  await releaseResources()
  reloadWithCacheBust()
}
