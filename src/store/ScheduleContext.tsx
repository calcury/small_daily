import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppData,
  EditPayload,
  PlanTarget,
  Segment,
  StatusDef,
  ThemeMode,
} from '../types'
import { DAY_MINUTES, NONE_STATUS_ID } from '../types'
import { newId } from '../lib/id'
import { MAX_DAILY_MINUTES, MAX_WEEKLY_MINUTES, toTargetMinutes } from '../lib/plans'
import { applyRange, emptyDay, lastStatusOf, normalize, seedDay } from '../lib/segments'
import { addDays, nowMinutes, toDateKey } from '../lib/time'
import {
  COLOR_PALETTE,
  createEmptyData,
  loadData,
  persist,
  sanitize,
  wipeAll,
} from './storage'

export type SaveState = 'saved' | 'pending' | 'error'

export interface ScheduleContextValue {
  data: AppData
  statuses: StatusDef[]
  /** 非「无」的用户状态 */
  customStatuses: StatusDef[]
  statusMap: Record<string, StatusDef>
  noneStatus: StatusDef

  theme: ThemeMode
  resolvedTheme: 'light' | 'dark'
  setTheme: (mode: ThemeMode) => void

  trendRange: number
  setTrendRange: (days: number) => void

  saveState: SaveState
  flashMessage: string | null
  notify: (message: string) => void

  /** 取某天的区段；没有记录时返回一个整天的「无」 */
  getSegments: (dateKey: string) => Segment[]
  /** 该天是否已经有自己的记录 */
  hasDay: (dateKey: string) => boolean
  /** 提交一次时段编辑（自动处理切分 / 补灰 / 合并） */
  applyEdit: (dateKey: string, payload: EditPayload) => void
  /** 从某一刻开始切换到新状态 */
  setStatusFrom: (dateKey: string, minute: number, statusId: string) => void
  clearDay: (dateKey: string) => void

  addStatus: (name?: string, color?: string) => StatusDef
  updateStatus: (id: string, patch: Partial<Pick<StatusDef, 'name' | 'color'>>) => void
  removeStatus: (id: string) => void
  moveStatus: (id: string, delta: number) => void

  /** 计划目标（每日 / 每周），一个状态最多一条 */
  plans: PlanTarget[]
  /** 取某状态的计划 */
  planFor: (statusId: string) => PlanTarget | undefined
  addPlan: (statusId?: string) => PlanTarget
  updatePlan: (
    id: string,
    patch: Partial<Pick<PlanTarget, 'statusId' | 'dailyMinutes' | 'weeklyMinutes'>>
  ) => void
  removePlan: (id: string) => void
  movePlan: (id: string, delta: number) => void

  replaceData: (next: AppData) => void
  resetData: () => void
  nextStatusColor: () => string
}

const ScheduleContext = createContext<ScheduleContextValue | null>(null)

const EMPTY_SEGMENTS: Segment[] = Object.freeze([
  { id: 'empty-day', start: 0, end: DAY_MINUTES, statusId: NONE_STATUS_ID },
]) as unknown as Segment[]

function pickColor(used: string[]): string {
  const free = COLOR_PALETTE.find((c) => !used.includes(c))
  return free ?? COLOR_PALETTE[used.length % COLOR_PALETTE.length]
}

/**
 * 新的一天的「开局」：今天还没有任何记录时，沿用前一天最后一个事件，
 * 让状态从 0 点延续下来 —— 打开就是「昨晚在做什么，现在还在继续」。
 * 只对「今天」生效（过去的空白日子不去补，避免误填历史）。
 */
function seedBaseFor(data: AppData, dateKey: string): Segment[] | null {
  if (dateKey !== toDateKey(new Date())) return null
  const prev = data.days[addDays(dateKey, -1)]?.segments
  if (!prev) return null
  const statusId = lastStatusOf(prev)
  return statusId ? seedDay(statusId) : null
}

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData())
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [flashMessage, setFlashMessage] = useState<string | null>(null)
  const [systemDark, setSystemDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const pendingRef = useRef<AppData | null>(null)
  const timerRef = useRef<number | null>(null)
  const flashTimerRef = useRef<number | null>(null)

  // ---------- 持久化：每次改动都写入 localStorage，永不自动清除 ----------
  useEffect(() => {
    pendingRef.current = data
    setSaveState('pending')
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      const payload = pendingRef.current
      if (!payload) return
      pendingRef.current = null
      const ok = persist(payload)
      setSaveState(ok ? 'saved' : 'error')
    }, 250)
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [data])

  // 离开页面 / 切到后台时立刻落盘，避免丢最后 250ms 的改动
  useEffect(() => {
    const flush = () => {
      const payload = pendingRef.current
      if (!payload) return
      pendingRef.current = null
      const ok = persist(payload, { rotateBackup: false })
      setSaveState(ok ? 'saved' : 'error')
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      flush()
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // ---------- 主题 ----------
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme: 'light' | 'dark' =
    data.theme === 'system' ? (systemDark ? 'dark' : 'light') : data.theme

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = resolvedTheme
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const notify = useCallback((message: string) => {
    setFlashMessage(message)
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current)
    flashTimerRef.current = window.setTimeout(() => setFlashMessage(null), 2400)
  }, [])

  // ---------- 派生数据 ----------
  const statusMap = useMemo(() => {
    const map: Record<string, StatusDef> = {}
    for (const status of data.statuses) map[status.id] = status
    return map
  }, [data.statuses])

  const noneStatus = statusMap[NONE_STATUS_ID] ?? {
    id: NONE_STATUS_ID,
    name: '无',
    color: '#94a3b8',
    builtin: true,
  }

  const customStatuses = useMemo(
    () => data.statuses.filter((s) => s.id !== NONE_STATUS_ID),
    [data.statuses]
  )

  // ---------- 日期与区段 ----------
  const getSegments = useCallback(
    (dateKey: string): Segment[] => data.days[dateKey]?.segments ?? EMPTY_SEGMENTS,
    [data.days]
  )

  const hasDay = useCallback((dateKey: string) => Boolean(data.days[dateKey]), [data.days])

  const mutateDay = useCallback(
    (dateKey: string, updater: (segments: Segment[]) => Segment[]) => {
      setData((prev) => {
        // 今天还没记录时，先按「前一天最后的事件」铺一个开局，编辑就建立在它之上
        const current = prev.days[dateKey]?.segments ?? seedBaseFor(prev, dateKey) ?? emptyDay()
        const next = normalize(updater(current))
        const stamp = Date.now()
        return {
          ...prev,
          updatedAt: stamp,
          days: {
            ...prev.days,
            [dateKey]: { date: dateKey, segments: next, updatedAt: stamp },
          },
        }
      })
    },
    []
  )

  const applyEdit = useCallback(
    (dateKey: string, payload: EditPayload) => {
      const { original, start, end, statusId } = payload
      mutateDay(dateKey, (segments) => {
        let working = segments
        if (original && (original.end > original.start)) {
          // 先把原始区间清成「无」，再涂上新范围 —— 缩短留出的空隙就是灰色
          working = applyRange(working, original.start, original.end, NONE_STATUS_ID)
        }
        return applyRange(working, start, end, statusId)
      })
    },
    [mutateDay]
  )

  const setStatusFrom = useCallback(
    (dateKey: string, minute: number, statusId: string) => {
      const from = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(minute)))
      mutateDay(dateKey, (segments) => applyRange(segments, from, DAY_MINUTES, statusId))
    },
    [mutateDay]
  )

  const clearDay = useCallback(
    (dateKey: string) => {
      setData((prev) => {
        const days = { ...prev.days }
        delete days[dateKey]
        return { ...prev, updatedAt: Date.now(), days }
      })
    },
    []
  )

  // ---------- 状态管理 ----------
  const nextStatusColor = useCallback(
    () => pickColor(data.statuses.map((s) => s.color)),
    [data.statuses]
  )

  const addStatus = useCallback(
    (name?: string, color?: string): StatusDef => {
      const created: StatusDef = {
        id: newId('st'),
        name: name && name.trim() ? name.trim() : '新状态',
        color: color ?? pickColor(data.statuses.map((s) => s.color)),
      }
      setData((prev) => {
        const noneDef = prev.statuses.find((s) => s.id === NONE_STATUS_ID)
        const rest = prev.statuses.filter((s) => s.id !== NONE_STATUS_ID)
        return {
          ...prev,
          updatedAt: Date.now(),
          statuses: noneDef ? [...rest, created, noneDef] : [...rest, created],
        }
      })
      return created
    },
    [data.statuses]
  )

  const updateStatus = useCallback(
    (id: string, patch: Partial<Pick<StatusDef, 'name' | 'color'>>) => {
      setData((prev) => ({
        ...prev,
        updatedAt: Date.now(),
        statuses: prev.statuses.map((s) =>
          s.id === id
            ? {
                ...s,
                name: patch.name !== undefined && patch.name.trim() ? patch.name : s.name,
                color: patch.color ?? s.color,
              }
            : s
        ),
      }))
    },
    []
  )

  /** 删除状态：历史记录里的该状态会退回「无」，不丢数据 */
  const removeStatus = useCallback((id: string) => {
    if (id === NONE_STATUS_ID) return
    setData((prev) => {
      const days: AppData['days'] = {}
      for (const [key, record] of Object.entries(prev.days)) {
        const touched = record.segments.some((s) => s.statusId === id)
        days[key] = touched
          ? {
              ...record,
              segments: normalize(
                record.segments.map((s) =>
                  s.statusId === id ? { ...s, statusId: NONE_STATUS_ID } : s
                )
              ),
            }
          : record
      }
      return {
        ...prev,
        updatedAt: Date.now(),
        statuses: prev.statuses.filter((s) => s.id !== id),
        // 状态没了，挂在它上面的计划也一起收走
        plans: prev.plans.filter((p) => p.statusId !== id),
        days,
      }
    })
  }, [])

  const moveStatus = useCallback((id: string, delta: number) => {
    if (id === NONE_STATUS_ID) return
    setData((prev) => {
      const noneDef = prev.statuses.find((s) => s.id === NONE_STATUS_ID)
      const rest = prev.statuses.filter((s) => s.id !== NONE_STATUS_ID)
      const pos = rest.findIndex((s) => s.id === id)
      if (pos < 0) return prev
      const target = pos + delta
      if (target < 0 || target >= rest.length) return prev
      const [item] = rest.splice(pos, 1)
      rest.splice(target, 0, item)
      return { ...prev, updatedAt: Date.now(), statuses: noneDef ? [...rest, noneDef] : rest }
    })
  }, [])

  // ---------- 计划 ----------
  const planFor = useCallback(
    (statusId: string) => data.plans.find((p) => p.statusId === statusId),
    [data.plans]
  )

  /** 新建一条计划：默认挑一个还没有计划的状态，避免一上来就重复 */
  const addPlan = useCallback(
    (statusId?: string): PlanTarget => {
      const used = new Set(data.plans.map((p) => p.statusId))
      const pick =
        statusId ??
        data.statuses.find((s) => s.id !== NONE_STATUS_ID && !used.has(s.id))?.id ??
        data.statuses.find((s) => s.id !== NONE_STATUS_ID)?.id ??
        NONE_STATUS_ID
      const created: PlanTarget = {
        id: newId('pl'),
        statusId: pick,
        dailyMinutes: 0,
        weeklyMinutes: 0,
      }
      setData((prev) => ({ ...prev, updatedAt: Date.now(), plans: [...prev.plans, created] }))
      return created
    },
    [data.plans, data.statuses]
  )

  const updatePlan = useCallback(
    (
      id: string,
      patch: Partial<Pick<PlanTarget, 'statusId' | 'dailyMinutes' | 'weeklyMinutes'>>
    ) => {
      setData((prev) => {
        const current = prev.plans.find((p) => p.id === id)
        if (!current) return prev
        const nextStatusId = patch.statusId ?? current.statusId
        // 改成另一个已有计划的状态时，把冲突的那条收走（一个状态只留一条计划）
        const plans = prev.plans
          .filter((p) => p.id === id || p.statusId !== nextStatusId)
          .map((p) =>
            p.id === id
              ? {
                  ...p,
                  statusId: nextStatusId,
                  dailyMinutes:
                    patch.dailyMinutes !== undefined
                      ? toTargetMinutes(patch.dailyMinutes, MAX_DAILY_MINUTES)
                      : p.dailyMinutes,
                  weeklyMinutes:
                    patch.weeklyMinutes !== undefined
                      ? toTargetMinutes(patch.weeklyMinutes, MAX_WEEKLY_MINUTES)
                      : p.weeklyMinutes,
                }
              : p
          )
        return { ...prev, updatedAt: Date.now(), plans }
      })
    },
    []
  )

  const removePlan = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      plans: prev.plans.filter((p) => p.id !== id),
    }))
  }, [])

  const movePlan = useCallback((id: string, delta: number) => {
    setData((prev) => {
      const plans = [...prev.plans]
      const pos = plans.findIndex((p) => p.id === id)
      if (pos < 0) return prev
      const target = pos + delta
      if (target < 0 || target >= plans.length) return prev
      const [item] = plans.splice(pos, 1)
      plans.splice(target, 0, item)
      return { ...prev, updatedAt: Date.now(), plans }
    })
  }, [])

  // ---------- 设置 ----------
  const setTheme = useCallback((mode: ThemeMode) => {
    setData((prev) => ({ ...prev, theme: mode, updatedAt: Date.now() }))
  }, [])

  const setTrendRange = useCallback((days: number) => {
    setData((prev) => ({ ...prev, trendRange: days, updatedAt: Date.now() }))
  }, [])

  const replaceData = useCallback((next: AppData) => {
    setData(sanitize(next))
  }, [])

  const resetData = useCallback(() => {
    wipeAll()
    setData(createEmptyData())
  }, [])

  const value = useMemo<ScheduleContextValue>(
    () => ({
      data,
      statuses: data.statuses,
      customStatuses,
      statusMap,
      noneStatus,
      theme: data.theme,
      resolvedTheme,
      setTheme,
      trendRange: data.trendRange,
      setTrendRange,
      saveState,
      flashMessage,
      notify,
      getSegments,
      hasDay,
      applyEdit,
      setStatusFrom,
      clearDay,
      addStatus,
      updateStatus,
      removeStatus,
      moveStatus,
      plans: data.plans,
      planFor,
      addPlan,
      updatePlan,
      removePlan,
      movePlan,
      replaceData,
      resetData,
      nextStatusColor,
    }),
    [
      data,
      customStatuses,
      statusMap,
      noneStatus,
      resolvedTheme,
      setTheme,
      setTrendRange,
      saveState,
      flashMessage,
      notify,
      getSegments,
      hasDay,
      applyEdit,
      setStatusFrom,
      clearDay,
      addStatus,
      updateStatus,
      removeStatus,
      moveStatus,
      planFor,
      addPlan,
      updatePlan,
      removePlan,
      movePlan,
      replaceData,
      resetData,
      nextStatusColor,
    ]
  )

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>
}

export function useSchedule(): ScheduleContextValue {
  const ctx = useContext(ScheduleContext)
  if (!ctx) throw new Error('useSchedule 必须在 ScheduleProvider 内部使用')
  return ctx
}

export { NONE_STATUS_ID, nowMinutes }
