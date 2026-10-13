import { useEffect, useRef, useState } from 'react'
import type { AppData } from '../types'
import {
  exportData,
  formatBytes,
  lastWriteHistory,
  parseImport,
  storageUsage,
  type StorageUsage,
} from '../store/storage'
import { toDateKey } from '../lib/time'
import { ConfirmDialog } from './Sheet'
import { IconDownload, IconTrash, IconUpload } from './icons'

interface DataPanelProps {
  data: AppData
  onReplace: (next: AppData) => void
  onNotify: (message: string) => void
  onReset: () => void
}

export function DataPanel({ data, onReplace, onNotify, onReset }: DataPanelProps) {
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [lastWrite, setLastWrite] = useState<number | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
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

      <div className="data-actions">
        <button type="button" className="btn btn--soft" onClick={handleExport}>
          <IconDownload size={16} />
          导出数据
        </button>
        <button
          type="button"
          className="btn btn--soft"
          onClick={() => fileRef.current?.click()}
        >
          <IconUpload size={16} />
          导入数据
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
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => setConfirmReset(true)}
        >
          <IconTrash size={16} />
          清空全部数据
        </button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        danger
        title="清空全部数据？"
        text="所有日程记录都会被删除，状态配色恢复默认。清空前会自动留一份备份。"
        confirmLabel="确定清空"
        onConfirm={() => {
          onReset()
          onNotify('数据已清空（清空前自动留了一份备份）')
        }}
        onClose={() => setConfirmReset(false)}
      />
    </section>
  )
}
