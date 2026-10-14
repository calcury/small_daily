import type { StatusDef } from '../types'
import { NONE_STATUS_ID } from '../types'
import { Sheet } from './Sheet'

interface StatusPickerProps {
  open: boolean
  statuses: StatusDef[]
  currentStatusId: string
  /** 从哪一刻开始切换（今天就是「此刻」） */
  fromMinute: number
  onPick: (statusId: string, fromMinute: number) => void
  onClose: () => void
}

/** 从某一刻开始切换状态——主界面上点「当前状态」就会打开它 */
export function StatusPicker({
  open,
  statuses,
  currentStatusId,
  fromMinute,
  onPick,
  onClose,
}: StatusPickerProps) {
  return (
    <Sheet open={open} title="切换状态" onClose={onClose}>
      <div className="picker-grid">
        {statuses.map((status) => {
          const active = status.id === currentStatusId
          const isNone = status.id === NONE_STATUS_ID
          return (
            <button
              key={status.id}
              type="button"
              className={`picker-item${active ? ' is-active' : ''}`}
              style={{ borderLeftColor: status.color }}
              onClick={() => {
                onPick(status.id, fromMinute)
                onClose()
              }}
            >
              <span className="picker-dot" style={{ background: status.color }} />
              <span className="picker-name">{status.name}</span>
              {active ? (
                <span className="picker-tag">{isNone ? '空闲' : '当前'}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
