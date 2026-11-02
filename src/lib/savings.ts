import type { BalanceEntry, MonthKey, SavingsAccount } from '../types'
import { daysInMonth, monthRange } from './dates'

export const latest = (a: SavingsAccount): BalanceEntry | null => a.history[a.history.length - 1] ?? null
export const previous = (a: SavingsAccount): BalanceEntry | null => a.history[a.history.length - 2] ?? null

/** Saldo de la cuenta a una fecha: el último registrado en o antes de `iso`. */
export function balanceAt(a: SavingsAccount, iso: string): BalanceEntry | null {
  let found: BalanceEntry | null = null
  for (const h of a.history) {
    if (h.date <= iso) found = h
    else break
  }
  return found
}

/** Valor en USD de un saldo. Los saldos en pesos usan el MEP guardado con el saldo (o el actual). */
export function toUSD(a: SavingsAccount, entry: BalanceEntry, currentMep: number | null): number | null {
  if (a.currency === 'USD') return entry.amount
  const rate = entry.mep ?? currentMep
  return rate ? entry.amount / rate : null
}

export interface SavingsTotals {
  /** Total valuado en dólares (null si hay saldos en pesos y no hay cotización) */
  usd: number | null
  /** Total valuado en pesos al MEP actual (null si hay USD y no hay cotización) */
  ars: number | null
  arsAccounts: number
  usdAccounts: number
}

export function totals(accounts: SavingsAccount[], mep: number | null): SavingsTotals {
  let arsAccounts = 0
  let usdAccounts = 0
  for (const a of accounts) {
    const l = latest(a)
    if (!l) continue
    if (a.currency === 'USD') usdAccounts += l.amount
    else arsAccounts += l.amount
  }
  return {
    usd: mep ? usdAccounts + arsAccounts / mep : arsAccounts === 0 ? usdAccounts : null,
    ars: mep ? arsAccounts + usdAccounts * mep : usdAccounts === 0 ? arsAccounts : null,
    arsAccounts,
    usdAccounts,
  }
}

export interface SavingsPoint {
  month: MonthKey
  usd: number
}

/** Total en USD a fin de cada mes (últimos `n` meses), con el MEP de cada carga. */
export function monthlyUSD(accounts: SavingsAccount[], end: MonthKey, n: number, currentMep: number | null): SavingsPoint[] {
  return monthRange(end, n).map((month) => {
    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
    let usd = 0
    for (const a of accounts) {
      const e = balanceAt(a, monthEnd)
      if (!e) continue
      usd += toUSD(a, e, currentMep) ?? 0
    }
    return { month, usd }
  })
}

/** Último MEP guardado en algún saldo; sirve de respaldo si no hay cotización del día. */
export function lastKnownMep(accounts: SavingsAccount[]): number | null {
  let best: { date: string; mep: number } | null = null
  for (const a of accounts)
    for (const h of a.history) if (h.mep && (!best || h.date > best.date)) best = { date: h.date, mep: h.mep }
  return best?.mep ?? null
}
