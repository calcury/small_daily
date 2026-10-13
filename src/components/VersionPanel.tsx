import { useState } from 'react'
import { pad2 } from '../lib/time'
import { updateVersion } from '../lib/update'
import { IconRefresh } from './icons'

/** 构建时刻 → 「10/13 21:40」 */
const BUILD_LABEL = (() => {
  try {
    const d = new Date(__BUILD_TIME__)
    if (Number.isNaN(d.getTime())) return '—'
    return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  } catch {
    return '—'
  }
})()

interface VersionPanelProps {
  onNotify: (message: string) => void
}

/**
 * 版本：一键释放所有页面资源并重新拉取。
 * 只清外壳缓存 + 注销 Service Worker，日程数据（localStorage）不受影响。
 */
export function VersionPanel({ onNotify }: VersionPanelProps) {
  const [busy, setBusy] = useState(false)

  const handleUpdate = async () => {
    if (busy) return
    setBusy(true)
    try {
      await updateVersion()
      // 正常情况下页面会立刻重新加载，这里不会执行到
    } catch (error) {
      setBusy(false)
      onNotify(error instanceof Error ? error.message : '更新失败，请稍后再试')
    }
  }

  return (
    <section className="card version-card">
      <div className="card-head">
        <h2 className="card-title">版本</h2>
        <span className="card-hint">构建于 {BUILD_LABEL}</span>
      </div>

      <button
        type="button"
        className="btn btn--soft"
        disabled={busy}
        onClick={() => void handleUpdate()}
      >
        <IconRefresh size={16} />
        {busy ? '正在更新…' : '更新版本'}
      </button>

      <p className="version-note">重新拉取页面资源并刷新，不会动你的记录。</p>
    </section>
  )
}
