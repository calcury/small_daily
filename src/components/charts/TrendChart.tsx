import type { PointerEvent as ReactPointerEvent } from 'react'
import { useElementWidth } from './useElementWidth'

export interface TrendSeries {
  id: string
  name: string
  color: string
  /** 每个 x 点的值，单位：分钟 */
  values: number[]
}

interface TrendChartProps {
  labels: string[]
  subLabels?: string[]
  series: TrendSeries[]
  mode: 'line' | 'stack'
  height?: number
  selectedIndex?: number | null
  onSelectIndex?: (index: number) => void
}

const Y_CANDIDATES = [2, 3, 4, 6, 8, 12, 16, 24]

function niceMaxHours(hours: number): number {
  for (const candidate of Y_CANDIDATES) {
    if (hours <= candidate) return candidate
  }
  return 24
}

/** 多序列趋势图：折线（周曲线）或堆叠柱，纵轴单位是小时 */
export function TrendChart({
  labels,
  subLabels,
  series,
  mode,
  height = 230,
  selectedIndex = null,
  onSelectIndex,
}: TrendChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const w = Math.max(width, 260)
  const pad = { top: 14, right: 8, bottom: 30, left: 32 }
  const plotW = Math.max(40, w - pad.left - pad.right)
  const plotH = Math.max(40, height - pad.top - pad.bottom)

  const totals = labels.map((_, index) =>
    series.reduce((acc, s) => acc + (s.values[index] ?? 0), 0)
  )
  const peak =
    mode === 'stack'
      ? Math.max(0, ...totals)
      : Math.max(0, ...series.flatMap((s) => s.values))
  const yMax = niceMaxHours(peak / 60) * 60

  const pointX = (index: number) =>
    labels.length <= 1 ? pad.left + plotW / 2 : pad.left + (plotW * index) / (labels.length - 1)

  const bandW = plotW / Math.max(labels.length, 1)
  const barW = Math.max(4, Math.min(30, bandW * 0.6))
  const bandX = (index: number) => pad.left + bandW * index + (bandW - barW) / 2
  const bandCenter = (index: number) => pad.left + bandW * index + bandW / 2

  const toY = (value: number) => pad.top + plotH - (Math.min(value, yMax) / yMax) * plotH

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ratio * yMax)
  const labelStep = Math.max(1, Math.ceil(labels.length / 7))

  const handlePick = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!onSelectIndex || labels.length === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    const relative = event.clientX - rect.left - pad.left
    const index =
      mode === 'stack'
        ? Math.floor(relative / bandW)
        : Math.round((relative / plotW) * (labels.length - 1))
    const clamped = Math.max(0, Math.min(labels.length - 1, index))
    onSelectIndex(clamped)
  }

  return (
    <div className="chart-wrap" ref={ref}>
      <svg
        width={w}
        height={height}
        className="chart-svg"
        onPointerDown={handlePick}
        role="img"
        aria-label={mode === 'stack' ? '每日状态时长堆叠图' : '每日状态时长趋势曲线'}
      >
        {/* 横向网格 + 纵轴刻度 */}
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={pad.left}
              x2={pad.left + plotW}
              y1={toY(value)}
              y2={toY(value)}
              style={{ stroke: 'var(--chart-grid)' }}
              strokeWidth={1}
            />
            <text
              x={pad.left - 6}
              y={toY(value) + 4}
              textAnchor="end"
              className="chart-tick"
              style={{ fill: 'var(--text-3)' }}
            >
              {value === 0 ? '0' : `${Math.round(value / 60)}h`}
            </text>
          </g>
        ))}

        {/* 选中竖线 */}
        {selectedIndex !== null && selectedIndex < labels.length ? (
          <line
            x1={mode === 'stack' ? bandCenter(selectedIndex) : pointX(selectedIndex)}
            x2={mode === 'stack' ? bandCenter(selectedIndex) : pointX(selectedIndex)}
            y1={pad.top}
            y2={pad.top + plotH}
            style={{ stroke: 'var(--accent)' }}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            opacity={0.6}
          />
        ) : null}

        {/* 数据 */}
        {mode === 'stack'
          ? labels.map((_, index) => {
              let cursor = 0
              return (
                <g key={index}>
                  {series.map((s) => {
                    const value = s.values[index] ?? 0
                    if (value <= 0) return null
                    const y1 = toY(cursor + value)
                    const y2 = toY(cursor)
                    cursor += value
                    return (
                      <rect
                        key={s.id}
                        x={bandX(index)}
                        y={y1}
                        width={barW}
                        height={Math.max(0.5, y2 - y1)}
                        fill={s.color}
                        rx={1.5}
                      />
                    )
                  })}
                </g>
              )
            })
          : series.map((s) => {
              const points = s.values
                .map((value, index) => `${pointX(index)},${toY(value)}`)
                .join(' ')
              return (
                <g key={s.id}>
                  {labels.length > 1 ? (
                    <polyline
                      points={points}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.95}
                    />
                  ) : null}
                  {s.values.map((value, index) => (
                    <circle
                      key={index}
                      cx={pointX(index)}
                      cy={toY(value)}
                      r={selectedIndex === index ? 4 : 2.6}
                      fill={s.color}
                      stroke="var(--surface)"
                      strokeWidth={selectedIndex === index ? 2 : 1}
                    />
                  ))}
                </g>
              )
            })}

        {/* x 轴标签 */}
        {labels.map((label, index) => {
          if (index % labelStep !== 0 && index !== labels.length - 1) return null
          return (
            <text
              key={index}
              x={mode === 'stack' ? bandCenter(index) : pointX(index)}
              y={height - 14}
              textAnchor="middle"
              className="chart-tick"
              style={{ fill: 'var(--text-3)' }}
            >
              {label}
            </text>
          )
        })}
        {subLabels
          ? labels.map((_, index) => {
              if (index % labelStep !== 0 && index !== labels.length - 1) return null
              return (
                <text
                  key={`sub-${index}`}
                  x={mode === 'stack' ? bandCenter(index) : pointX(index)}
                  y={height - 3}
                  textAnchor="middle"
                  className="chart-tick chart-tick--sub"
                  style={{ fill: 'var(--text-3)' }}
                >
                  {subLabels[index]}
                </text>
              )
            })
          : null}
      </svg>
    </div>
  )
}
