import type { Category, CreditCard, Expense, MonthKey } from '../types'
import { getCategory, type CategoryLookup } from './categories'
import { chargeDueDate, installmentAmount, installmentsOf } from './cards'
import { currentMonth, daysInMonth, monthOf, monthRange, shiftMonth } from './dates'

/** Un movimiento tal como cuenta en un mes: el gasto entero o una de sus cuotas. */
export interface LedgerEntry extends Expense {
  /** Mes al que se imputa (ver `buildLedger`). Todas las estadísticas usan esto, no `date`. */
  month: MonthKey
  /** Sólo crédito con tarjeta: vencimiento del resumen en el que se paga */
  dueDate?: string
  /** Sólo en compras en cuotas: qué cuota es y de qué gasto sale */
  installment?: { number: number; of: number; total: number; sourceId: string; sourceDate: string }
}

/** Misma fecha `k` meses después (si el mes es más corto, el último día). */
function addMonths(date: string, k: number): string {
  const m = shiftMonth(monthOf(date), k)
  const day = Math.min(Number(date.slice(8, 10)), daysInMonth(m))
  return `${m}-${String(day).padStart(2, '0')}`
}

type CardIndex = ReadonlyMap<string, CreditCard>

/** Tarjeta con la que se pagó un gasto a crédito (null si no tiene o si ya se borró). */
function cardOf(e: Expense, cards: CardIndex): CreditCard | null {
  return e.paymentMethod === 'credito' && e.cardId ? (cards.get(e.cardId) ?? null) : null
}

/**
 * Imputación de un gasto (o de su cuota `k`, 0 = la primera) a un mes:
 * - Crédito con tarjeta: el mes en que vence el resumen donde cae. Compra del 21/10
 *   con una tarjeta que cierra el 29 y vence el 11 → resumen que vence el 11/11 → noviembre.
 * - Todo lo demás (efectivo, débito, crédito sin tarjeta): el mes de la compra, más `k`.
 */
export function imputation(e: Expense, cards: CardIndex, k = 0): { month: MonthKey; dueDate?: string } {
  const card = cardOf(e, cards)
  if (!card) return { month: shiftMonth(monthOf(e.date), k) }
  const dueDate = chargeDueDate(card, e.date, k)
  return { month: monthOf(dueDate), dueDate }
}

/**
 * Arma los movimientos de Gastos: cada gasto imputado a su mes (ver `imputation`)
 * y las compras en cuotas repartidas de a una por mes: $20.000 en 4 cuotas
 * cuenta $5.000 (1/4), (2/4), (3/4) y (4/4) en cuatro meses seguidos.
 * Todas las estadísticas del mes (KPIs, presupuesto, ranking, tendencia, lista) usan esto.
 */
export function buildLedger(expenses: Expense[], cards: CreditCard[] = []): LedgerEntry[] {
  const index: CardIndex = new Map(cards.map((c) => [c.id, c]))
  const out: LedgerEntry[] = []
  for (const e of expenses) {
    const n = installmentsOf(e)
    if (n <= 1) {
      out.push({ ...e, ...imputation(e, index) })
      continue
    }
    const withCard = cardOf(e, index) != null
    for (let k = 0; k < n; k++) {
      out.push({
        ...e,
        ...imputation(e, index, k),
        id: `${e.id}#${k + 1}`,
        // Con tarjeta queda la fecha de compra (el mes lo da el vencimiento); sin tarjeta, una cuota por mes
        date: withCard ? e.date : addMonths(e.date, k),
        amount: installmentAmount(e.amount, n, k),
        installment: { number: k + 1, of: n, total: e.amount, sourceId: e.id, sourceDate: e.date },
      })
    }
  }
  return out
}

/** Movimientos imputados al mes (por vencimiento, no por fecha de compra). */
export function expensesInMonth(entries: LedgerEntry[], month: MonthKey): LedgerEntry[] {
  return entries.filter((e) => e.month === month)
}

export const sum = (xs: Expense[]) => xs.reduce((acc, e) => acc + e.amount, 0)

export interface CategoryTotal {
  category: Category
  total: number
  share: number
  count: number
  previous: number
}

/** Totales por categoría del mes, ordenados de mayor a menor. */
export function totalsByCategory(expenses: LedgerEntry[], month: MonthKey, lookup: CategoryLookup = getCategory): CategoryTotal[] {
  const current = expensesInMonth(expenses, month)
  const prev = expensesInMonth(expenses, shiftMonth(month, -1))
  const total = sum(current)

  const acc = new Map<string, { total: number; count: number }>()
  for (const e of current) {
    const row = acc.get(e.categoryId) ?? { total: 0, count: 0 }
    row.total += e.amount
    row.count += 1
    acc.set(e.categoryId, row)
  }
  const prevAcc = new Map<string, number>()
  for (const e of prev) prevAcc.set(e.categoryId, (prevAcc.get(e.categoryId) ?? 0) + e.amount)

  return [...acc.entries()]
    .map(([id, r]) => ({
      category: lookup(id),
      total: r.total,
      count: r.count,
      share: total > 0 ? r.total / total : 0,
      previous: prevAcc.get(id) ?? 0,
    }))
    .sort((a, b) => b.total - a.total)
}

export interface MonthTotal {
  month: MonthKey
  total: number
}

export function monthlyTotals(expenses: LedgerEntry[], end: MonthKey, n = 6): MonthTotal[] {
  const totals = new Map<MonthKey, number>()
  for (const e of expenses) totals.set(e.month, (totals.get(e.month) ?? 0) + e.amount)
  return monthRange(end, n).map((month) => ({ month, total: totals.get(month) ?? 0 }))
}

export interface MonthSummary {
  total: number
  previousTotal: number
  /** null si el mes anterior no tiene gastos */
  delta: number | null
  dailyAverage: number
  count: number
  fixed: number
  variable: number
  top: CategoryTotal | null
}

export function summarize(
  expenses: LedgerEntry[],
  month: MonthKey,
  lookup: CategoryLookup = getCategory,
  now = new Date(),
): MonthSummary {
  const current = expensesInMonth(expenses, month)
  const total = sum(current)
  const previousTotal = sum(expensesInMonth(expenses, shiftMonth(month, -1)))
  const isCurrent = month === currentMonth(now)
  const days = isCurrent ? now.getDate() : daysInMonth(month)
  const byCat = totalsByCategory(expenses, month, lookup)

  let fixed = 0
  for (const e of current) if (lookup(e.categoryId).kind === 'fijo') fixed += e.amount

  return {
    total,
    previousTotal,
    delta: previousTotal > 0 ? (total - previousTotal) / previousTotal : null,
    dailyAverage: days > 0 ? total / days : 0,
    count: current.length,
    fixed,
    variable: total - fixed,
    top: byCat[0] ?? null,
  }
}
