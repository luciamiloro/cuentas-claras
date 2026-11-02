import type { BalanceEntry, CreditCard, CustomCategory, SavingsAccount, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { DEFAULT_CUSTOM_EMOJI, FACTORY_IDS, cleanName, firstGrapheme } from './categories'

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

export function normalizeCategory(x: unknown): CustomCategory | null {
  if (!x || typeof x !== 'object') return null
  const c = x as Record<string, unknown>
  if (typeof c.id !== 'string' || !c.id || typeof c.name !== 'string') return null
  const name = cleanName(c.name)
  if (!name) return null
  return {
    id: c.id,
    name,
    emoji: (typeof c.emoji === 'string' && firstGrapheme(c.emoji)) || DEFAULT_CUSTOM_EMOJI,
    kind: c.kind === 'fijo' ? 'fijo' : 'variable',
    archived: c.archived === true,
  }
}

/** Normaliza una lista de categorías propias: descarta inválidas, ids repetidos y los que pisan a las de fábrica. */
export function normalizeCategories(raw: unknown): CustomCategory[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: CustomCategory[] = []
  for (const item of raw) {
    const c = normalizeCategory(item)
    if (!c || seen.has(c.id) || FACTORY_IDS.has(c.id)) continue
    seen.add(c.id)
    out.push(c)
  }
  return out
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
    categories: normalizeCategories(r.categories),
  }
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
        const r = (Math.random() * 16) | 0
        return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })
