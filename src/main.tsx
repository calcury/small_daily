import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ScheduleProvider } from './store/ScheduleContext'
import './styles/index.css'

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
