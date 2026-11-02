import type { MonthKey } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')

export function todayISO(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function currentMonth(now = new Date()): MonthKey {
  return todayISO(now).slice(0, 7)
}

export function monthOf(isoDate: string): MonthKey {
  return isoDate.slice(0, 7)
}

export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function daysInMonth(key: MonthKey): number {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** Últimos `n` meses terminando en `end` (inclusive), del más viejo al más nuevo. */
export function monthRange(end: MonthKey, n: number): MonthKey[] {
  return Array.from({ length: n }, (_, i) => shiftMonth(end, i - (n - 1)))
}

/** Fecha por defecto para un gasto nuevo en el mes que se está mirando. */
export function defaultDateFor(month: MonthKey, now = new Date()): string {
  if (month === currentMonth(now)) return todayISO(now)
  return `${month}-01`
}
