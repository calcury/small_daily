/*
 * small_daily 离线缓存 Service Worker
 *
 * 策略：
 *  - 安装后立即接管（skipWaiting + clients.claim）
 *  - 所有同源 GET 请求：缓存优先，同时后台静默更新（stale-while-revalidate）
 *  - 导航请求离线时回退到已缓存的 index.html
 *
 * 注意：这里只管理「应用外壳」缓存，永远不会触碰用户的日程数据。
 * 用户数据保存在 localStorage 中，由数据层负责，永不自动清除。
 */

const SHELL_CACHE = 'small_daily-shell-v1'
const SHELL_PREFIX = 'small_daily-shell-'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      // 只清理本应用自己的旧版本外壳缓存，绝不删除其他缓存
      await Promise.all(
        keys
          .filter((key) => key.startsWith(SHELL_PREFIX) && key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
      )
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch (err) {
    return
  }
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithShellFallback(request))
    return
  }

  event.respondWith(staleWhileRevalidate(request))
})

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE)
  const cached = await cache.match(request)

  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => null)

  if (cached) return cached

  const fresh = await network
  if (fresh) return fresh
  return new Response('', { status: 504, statusText: 'Offline' })
}

async function networkFirstWithShellFallback(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response && response.status === 200) {
      cache.put(request, response.clone())
    }
    return response
  } catch (err) {
    const shell =
      (await cache.match(request)) ||
      (await cache.match(new URL('index.html', self.registration.scope).toString())) ||
      (await cache.match(new URL('.', self.registration.scope).toString()))
    if (shell) return shell
    return new Response('离线且没有可用缓存', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}
