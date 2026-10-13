import { useEffect, useRef, useState } from 'react'
import type { AppData } from '../types'
import {
  exportData,
  formatBytes,
  lastWriteHistory,
  parseImport,
  persist,
  storageUsage,
  type StorageUsage,
} from '../store/storage'
import { withDemoData } from '../lib/demo'
import { toDateKey } from '../lib/time'
import { ConfirmButton } from './Sheet'
import { IconDownload, IconSpark, IconTrash, IconUpload } from './icons'

interface DataPanelProps {
  data: AppData
  onReplace: (next: AppData) => void
  onNotify: (message: string) => void
  onReset: () => void
}

export function DataPanel({ data, onReplace, onNotify, onReset }: DataPanelProps) {
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [lastWrite, setLastWrite] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let alive = true
    storageUsage(data).then((result) => {
      if (alive) setUsage(result)
    })
    const history = lastWriteHistory()
    setLastWrite(history.length ? history[history.length - 1] : null)
    return () => {
      alive = false
    }
  }, [data])

  const handleExport = () => {
    const text = exportData(data)
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `small_daily-${toDateKey()}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    onNotify('已导出备份文件')
  }

  const handleImport = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = parseImport(text)
      onReplace(parsed)
      onNotify(`导入成功，共 ${Object.keys(parsed.days).length} 天记录`)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : '导入失败')
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">数据</h2>
      </div>

      <div className="data-stats">
        <div className="data-stat">
          <span className="data-stat-k">记录天数</span>
          <span className="data-stat-v">{usage ? usage.dayCount : '—'}</span>
        </div>
        <div className="data-stat">
          <span className="data-stat-k">数据体积</span>
          <span className="data-stat-v">{usage ? formatBytes(usage.bytes) : '—'}</span>
        </div>
        <div className="data-stat">
          <span className="data-stat-k">最近保存</span>
          <span className="data-stat-v data-stat-v--sm">
            {lastWrite
              ? new Date(lastWrite).toLocaleString('zh-CN', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'}
          </span>
        </div>
      </div>

      <p className="data-note">
        <IconSpark size={15} />
        所有内容都会自动保存在这台设备的浏览器里，
        <strong>不会自动清除</strong>，也不会上传到任何服务器。清除浏览器数据会一并清掉它，
        所以建议偶尔导出一次备份。
      </p>

      <div className="data-actions">
        <button type="button" className="btn btn--soft" onClick={handleExport}>
          <IconDownload size={16} />
          导出 JSON 备份
        </button>
        <button
          type="button"
          className="btn btn--soft"
          onClick={() => fileRef.current?.click()}
        >
          <IconUpload size={16} />
          导入备份
        </button>
        <button
          type="button"
          className="btn btn--soft"
          onClick={() => {
            const result = withDemoData(data, 7)
            if (result.added === 0) {
              onNotify('最近 7 天都已有记录，未做改动')
              return
            }
            persist(result.data, { rotateBackup: true })
            onReplace(result.data)
            onNotify(`已填充 ${result.added} 天示例数据`)
          }}
        >
          <IconSpark size={16} />
          填充示例数据
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden-input"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleImport(file)
          event.target.value = ''
        }}
      />

      <div className="danger-zone">
        <ConfirmButton
          className="btn btn--danger"
          label="清空全部数据"
          confirmLabel="真的要清空？再点一次"
          icon={<IconTrash size={16} />}
          onConfirm={() => {
            onReset()
            onNotify('数据已清空（清空前自动留了一份备份）')
          }}
        />
        <p className="danger-note">清空只会重置记录，状态配色会恢复默认。</p>
      </div>
    </section>
  )
}
