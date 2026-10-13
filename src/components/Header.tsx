import type { ThemeMode } from '../types'
import { addDays, friendlyDate, monthDayLabel, weekdayLabel } from '../lib/time'
import type { SaveState } from '../store/ScheduleContext'
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconMonitor,
  IconMoon,
  IconSun,
} from './icons'

interface HeaderProps {
  dateKey: string
  todayKey: string
  onDateChange: (key: string) => void
  /** 打开日历 */
  onOpenCalendar: () => void
  calendarOpen: boolean
  /** 是否显示日期导航（只在「今日」有意义，别的标签页不显示） */
  showDateNav?: boolean
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
  saveState: SaveState
}

const THEME_ORDER: ThemeMode[] = ['light', 'dark', 'system']
const THEME_LABEL: Record<ThemeMode, string> = {
  light: '浅色',
  dark: '深色',
  system: '跟随系统',
}

export function Header({
  dateKey,
  todayKey,
  onDateChange,
  onOpenCalendar,
  calendarOpen,
  showDateNav = true,
  theme,
  onThemeChange,
  saveState,
}: HeaderProps) {
  const isToday = dateKey === todayKey
  const canGoForward = dateKey < todayKey

  const cycleTheme = () => {
    const index = THEME_ORDER.indexOf(theme)
    onThemeChange(THEME_ORDER[(index + 1) % THEME_ORDER.length])
  }

  return (
    <header className="hdr">
      <div className="hdr-row">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">
            small<em>_daily</em>
          </span>
        </div>

        <div className="hdr-actions">
          <span className={`save-pill save-pill--${saveState}`} title="数据实时保存在本机，永不自动清除">
            <span className="save-dot" aria-hidden="true" />
            {saveState === 'saved' ? '已保存' : saveState === 'pending' ? '保存中' : '保存异常'}
          </span>
          {showDateNav && !isToday ? (
            <button
              type="button"
              className="mini-btn"
              onClick={() => onDateChange(todayKey)}
            >
              回到今天
            </button>
          ) : null}
          <button
            type="button"
            className="icon-btn"
            onClick={cycleTheme}
            aria-label={`切换主题（当前：${THEME_LABEL[theme]}）`}
            title={`主题：${THEME_LABEL[theme]}（点击切换）`}
          >
            {theme === 'light' ? (
              <IconSun size={18} />
            ) : theme === 'dark' ? (
              <IconMoon size={18} />
            ) : (
              <IconMonitor size={18} />
            )}
          </button>
        </div>
      </div>

      {showDateNav ? (
        <div className="datenav">
          <button
            type="button"
            className="datenav-arrow"
            onClick={() => onDateChange(addDays(dateKey, -1))}
            aria-label="前一天"
          >
            <IconChevronLeft size={20} />
          </button>

          <button
            type="button"
            className="datenav-center"
            onClick={onOpenCalendar}
            aria-haspopup="dialog"
            aria-expanded={calendarOpen}
            aria-label="打开日历选择日期"
          >
            <span className="datenav-main">
              {monthDayLabel(dateKey)}
              <span className="datenav-week">{weekdayLabel(dateKey)}</span>
            </span>
            <span className="datenav-sub">
              {isToday ? '今天' : friendlyDate(dateKey, todayKey)}
              <IconChevronDown size={13} className="datenav-caret" />
            </span>
          </button>

          <button
            type="button"
            className="datenav-arrow"
            disabled={!canGoForward}
            onClick={() => onDateChange(addDays(dateKey, 1))}
            aria-label="后一天"
          >
            <IconChevronRight size={20} />
          </button>
        </div>
      ) : null}
    </header>
  )
}
