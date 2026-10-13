import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ScheduleProvider } from './store/ScheduleContext'
import { stripReloadFlag } from './lib/update'
import './styles/index.css'

// 「更新版本」是用带 ?v=<时间戳> 的地址重新加载的（为了绕开 HTTP 缓存），
// 加载完就把这个参数抹掉，免得留在地址栏 / 被收藏出去。
stripReloadFlag()

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

createRoot(container).render(
  <StrictMode>
    <ScheduleProvider>
      <App />
    </ScheduleProvider>
  </StrictMode>
)

// 注册 Service Worker：应用外壳离线可用，但绝不触碰用户数据
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const url = `${import.meta.env.BASE_URL}sw.js`
    navigator.serviceWorker.register(url).catch((error) => {
      console.warn('[small_daily] Service Worker 注册失败', error)
    })
  })
}
