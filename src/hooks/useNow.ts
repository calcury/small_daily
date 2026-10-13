import { useEffect, useState } from 'react'

/** 每 intervalMs 刷新一次的「当前时间」，用于推进时间轴上的 now 游标 */
export function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}
