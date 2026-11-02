import type { BalanceEntry, CreditCard, SavingsAccount, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

const day = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : fallback
}

function normalizeCard(x: unknown): CreditCard | null {
  if (!x || typeof x !== 'object') return null
  const c = x as Record<string, unknown>
  if (typeof c.id !== 'string' || typeof c.name !== 'string') return null
  return {
    id: c.id,
    name: c.name,
    closingDay: day(c.closingDay, 25),
    dueDay: day(c.dueDay, 5),
    autoDebit: c.autoDebit !== false,
    remindDaysBefore: Math.min(Math.max(Number(c.remindDaysBefore) || 3, 0), 15),
  }
}

function normalizeAccount(x: unknown): SavingsAccount | null {
  if (!x || typeof x !== 'object') return null
  const a = x as Record<string, unknown>
  if (typeof a.id !== 'string' || typeof a.name !== 'string') return null
  const history: BalanceEntry[] = Array.isArray(a.history)
    ? a.history
        .filter(
          (h): h is BalanceEntry =>
            !!h && typeof h === 'object' && typeof (h as BalanceEntry).date === 'string' && Number.isFinite(Number((h as BalanceEntry).amount)),
        )
        .map((h) => ({ date: h.date, amount: Number(h.amount), mep: num(h.mep) }))
        .sort((p, q) => p.date.localeCompare(q.date))
    : []
  const kinds = ['broker', 'banco', 'billetera', 'efectivo', 'otro'] as const
  return {
    id: a.id,
    name: a.name,
    kind: kinds.includes(a.kind as (typeof kinds)[number]) ? (a.kind as SavingsAccount['kind']) : 'otro',
    currency: a.currency === 'USD' ? 'USD' : 'ARS',
    history,
  }
}

/** Acepta lo que venga del almacenamiento (versiones viejas incluidas) y devuelve Settings válido. */
export function normalizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const r = raw as Record<string, unknown>
  return {
    monthlyBudget: num(r.monthlyBudget),
    usdCardRate: num(r.usdCardRate),
    usdMepRate: num(r.usdMepRate),
    cards: Array.isArray(r.cards) ? r.cards.map(normalizeCard).filter((c): c is CreditCard => c !== null) : [],
    savings: Array.isArray(r.savings)
      ? r.savings.map(normalizeAccount).filter((a): a is SavingsAccount => a !== null)
      : [],
  }
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
        const r = (Math.random() * 16) | 0
        return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })
