export interface DonutItem {
  id: string
  name: string
  color: string
  value: number
}

interface DonutChartProps {
  items: DonutItem[]
  size?: number
  thickness?: number
  centerTop: string
  centerMain: string
}

/** 环形图：某个状态下各状态的时长占比 */
export function DonutChart({
  items,
  size = 168,
  thickness = 22,
  centerTop,
  centerMain,
}: DonutChartProps) {
  const visible = items.filter((item) => item.value > 0)
  const total = visible.reduce((acc, item) => acc + item.value, 0)
  const radius = (size - thickness) / 2
  const center = size / 2
  const circumference = 2 * Math.PI * radius

  let offset = 0

  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label="状态时长占比">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          style={{ stroke: 'var(--chart-track)' }}
        />
        {total > 0
          ? visible.map((item) => {
              const fraction = item.value / total
              const length = fraction * circumference
              const gap = length > 6 ? 2 : 0
              const dash = Math.max(0, length - gap)
              const element = (
                <circle
                  key={item.id}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${center} ${center})`}
                  strokeLinecap="butt"
                />
              )
              offset += length
              return element
            })
          : null}
      </svg>

      <div className="donut-center">
        <span className="donut-center-top">{centerTop}</span>
        <span className="donut-center-main">{centerMain}</span>
      </div>
    </div>
  )
}

interface RankBarsProps {
  items: DonutItem[]
  formatValue: (value: number) => string
}

/** 时长排行：条形长度相对于最长的一项 */
export function RankBars({ items, formatValue }: RankBarsProps) {
  const sorted = [...items].filter((item) => item.value > 0).sort((a, b) => b.value - a.value)
  const max = sorted.length ? sorted[0].value : 1

  if (sorted.length === 0) {
    return <p className="empty-note">这一天还没有记录。</p>
  }

  return (
    <ul className="rank-list">
      {sorted.map((item) => (
        <li className="rank-row" key={item.id}>
          <span className="rank-name">{item.name}</span>
          <span className="rank-track">
            <span
              className="rank-fill"
              style={{ width: `${(item.value / max) * 100}%`, background: item.color }}
            />
          </span>
          <span className="rank-value">{formatValue(item.value)}</span>
        </li>
      ))}
    </ul>
  )
}
