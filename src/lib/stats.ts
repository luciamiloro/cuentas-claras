import type { Category, Expense, MonthKey } from '../types'
import { getCategory, type CategoryLookup } from './categories'
import { installmentAmount, installmentsOf } from './cards'
import { currentMonth, daysInMonth, monthOf, monthRange, shiftMonth } from './dates'

/** Un movimiento tal como cuenta en un mes: el gasto entero o una de sus cuotas. */
export interface LedgerEntry extends Expense {
  /** Sólo en compras en cuotas: qué cuota es y de qué gasto sale */
  installment?: { number: number; of: number; total: number; sourceId: string; sourceDate: string }
}

/** Misma fecha `k` meses después (si el mes es más corto, el último día). */
function addMonths(date: string, k: number): string {
  const m = shiftMonth(monthOf(date), k)
  const day = Math.min(Number(date.slice(8, 10)), daysInMonth(m))
  return `${m}-${String(day).padStart(2, '0')}`
}

/**
 * Reparte las compras en cuotas: una de $20.000 en 4 cuotas hecha en noviembre
 * cuenta $5.000 en noviembre (1/4), diciembre (2/4), enero (3/4) y febrero (4/4).
 * Los gastos en un pago quedan igual. Todas las estadísticas del mes usan esto.
 */
export function spreadInstallments(expenses: Expense[]): LedgerEntry[] {
  const out: LedgerEntry[] = []
  for (const e of expenses) {
    const n = installmentsOf(e)
    if (n <= 1) {
      out.push(e)
      continue
    }
    for (let k = 0; k < n; k++) {
      out.push({
        ...e,
        id: `${e.id}#${k + 1}`,
        date: addMonths(e.date, k),
        amount: installmentAmount(e.amount, n, k),
        installment: { number: k + 1, of: n, total: e.amount, sourceId: e.id, sourceDate: e.date },
      })
    }
  }
  return out
}

export function expensesInMonth<T extends Expense>(expenses: T[], month: MonthKey): T[] {
  return expenses.filter((e) => monthOf(e.date) === month)
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
export function totalsByCategory(expenses: Expense[], month: MonthKey, lookup: CategoryLookup = getCategory): CategoryTotal[] {
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

export function monthlyTotals(expenses: Expense[], end: MonthKey, n = 6): MonthTotal[] {
  const totals = new Map<MonthKey, number>()
  for (const e of expenses) {
    const m = monthOf(e.date)
    totals.set(m, (totals.get(m) ?? 0) + e.amount)
  }
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
  expenses: Expense[],
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
