import { useState } from 'react'
import type { StatusDef } from '../types'
import { NONE_STATUS_ID } from '../types'
import { COLOR_PALETTE } from '../store/storage'
import { ConfirmButton } from './Sheet'
import { IconDown, IconPlus, IconTrash, IconUp } from './icons'

interface StatusManagerProps {
  statuses: StatusDef[]
  usageByStatus: Record<string, number>
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<Pick<StatusDef, 'name' | 'color'>>) => void
  onRemove: (id: string) => void
  onMove: (id: string, delta: number) => void
}

/** 自定义状态：改名、改色、排序、删除 */
export function StatusManager({
  statuses,
  usageByStatus,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
}: StatusManagerProps) {
  const [openPaletteId, setOpenPaletteId] = useState<string | null>(null)
  const custom = statuses.filter((s) => s.id !== NONE_STATUS_ID)

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">状态</h2>
        <button type="button" className="mini-btn mini-btn--solid" onClick={onAdd}>
          <IconPlus size={15} />
          新建
        </button>
      </div>

      <ul className="status-manage-list">
        {custom.map((status, index) => (
          <li key={status.id} className="status-manage-row">
            <div className="status-manage-main">
              <button
                type="button"
                className="color-swatch"
                style={{ background: status.color }}
                aria-label={`修改「${status.name}」的颜色`}
                onClick={() =>
                  setOpenPaletteId((prev) => (prev === status.id ? null : status.id))
                }
              />

              <input
                className="text-input"
                value={status.name}
                maxLength={8}
                aria-label="状态名称"
                onChange={(event) => onUpdate(status.id, { name: event.target.value })}
              />

              <div className="status-manage-actions">
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  disabled={index === 0}
                  aria-label="上移"
                  onClick={() => onMove(status.id, -1)}
                >
                  <IconUp size={15} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  disabled={index === custom.length - 1}
                  aria-label="下移"
                  onClick={() => onMove(status.id, 1)}
                >
                  <IconDown size={15} />
                </button>
                <ConfirmButton
                  className="icon-btn icon-btn--sm icon-btn--danger"
                  label=""
                  confirmLabel="确认"
                  icon={<IconTrash size={15} />}
                  onConfirm={() => onRemove(status.id)}
                />
              </div>
            </div>

            {openPaletteId === status.id ? (
              <div className="palette">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`palette-dot${color.toLowerCase() === status.color.toLowerCase() ? ' is-active' : ''}`}
                    style={{ background: color }}
                    aria-label={`使用颜色 ${color}`}
                    onClick={() => {
                      onUpdate(status.id, { color })
                      setOpenPaletteId(null)
                    }}
                  />
                ))}
                <label className="palette-custom">
                  <input
                    type="color"
                    value={status.color}
                    onChange={(event) => onUpdate(status.id, { color: event.target.value })}
                  />
                  自定义
                </label>
              </div>
            ) : null}

            {usageByStatus[status.id] ? (
              <p className="status-manage-usage">
                已用于 {usageByStatus[status.id]} 天记录
              </p>
            ) : null}
          </li>
        ))}

        <li className="status-manage-row status-manage-row--builtin">
          <div className="status-manage-main">
            <span className="color-swatch" style={{ background: '#94a3b8' }} />
            <span className="status-manage-name">无（空闲）</span>
            <span className="status-manage-tag">内置</span>
          </div>
          <p className="status-manage-usage">灰色空白时段，不能删除，可以随时给它涂上别的状态。</p>
        </li>
      </ul>
    </section>
  )
}
