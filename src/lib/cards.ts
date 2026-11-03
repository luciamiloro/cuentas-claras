import type { CreditCard, Expense } from '../types'
import { todayISO } from './dates'

const pad = (n: number) => String(n).padStart(2, '0')

/** Fecha (YYYY-MM-DD) del día `d` en el mes dado; si el mes es más corto, usa el último día. */
function dayIn(year: number, month0: number, d: number): string {
  const first = new Date(year, month0, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(Math.min(d, last))}`
}

const parts = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m0: m - 1, d }
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = parts(fromISO)
  const b = parts(toISO)
  return Math.round((Date.UTC(b.y, b.m0, b.d) - Date.UTC(a.y, a.m0, a.d)) / 86_400_000)
}

export interface CardCycle {
  /** Próximo vencimiento (hoy o después) */
  dueDate: string
  /** Cierre del resumen que vence en `dueDate` */
  closingDate: string
  /** Cierre anterior: el resumen incluye compras posteriores a esta fecha */
  previousClosingDate: string
  daysToDue: number
  /** El resumen ya cerró (las compras nuevas van al siguiente) */
  isClosed: boolean
}

/**
 * Calcula el ciclo del resumen que vence próximamente.
 * Convención argentina: si el día de vencimiento es menor o igual al de cierre,
 * el resumen que cierra en un mes vence el mes siguiente.
 */
export function currentCycle(card: CreditCard, today = todayISO()): CardCycle {
  const t = parts(today)
  let dueDate = dayIn(t.y, t.m0, card.dueDay)
  if (dueDate < today) dueDate = dayIn(t.y, t.m0 + 1, card.dueDay)

  const due = parts(dueDate)
  const sameMonth = card.dueDay > card.closingDay
  const closingDate = dayIn(due.y, sameMonth ? due.m0 : due.m0 - 1, card.closingDay)
  const c = parts(closingDate)
  const previousClosingDate = dayIn(c.y, c.m0 - 1, card.closingDay)

  return {
    dueDate,
    closingDate,
    previousClosingDate,
    daysToDue: daysBetween(today, dueDate),
    isClosed: closingDate <= today,
  }
}

// ---------- Cuotas ----------

export const MAX_INSTALLMENTS = 48
export const INSTALLMENT_OPTIONS = [1, 2, 3, 6, 9, 12, 18, 24]

/** Cantidad de cuotas válida de un gasto: sólo compras en pesos con crédito; si no, 1. */
export function installmentsOf(e: Pick<Expense, 'paymentMethod' | 'currency' | 'installments'>): number {
  if (e.paymentMethod !== 'credito' || e.currency === 'USD') return 1
  const n = Number(e.installments)
  return Number.isInteger(n) && n > 1 ? Math.min(n, MAX_INSTALLMENTS) : 1
}

/** Monto de la cuota `k` (0 = primera) de `n`: partes iguales; la última absorbe los centavos del redondeo. */
export function installmentAmount(total: number, n: number, k = 0): number {
  if (n <= 1) return total
  const base = Math.floor((total * 100) / n) / 100
  return k === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base
}

// ---------- Resúmenes ----------

export interface StatementSummary {
  card: CreditCard
  cycle: CardCycle
  /** Total en pesos (cuotas incluidas) */
  ars: number
  /** Total en dólares */
  usd: number
  count: number
  /** Toca avisar: estamos dentro de los días de anticipación configurados */
  shouldAlert: boolean
}

export function statementFor(card: CreditCard, expenses: Expense[], today = todayISO()): StatementSummary {
  const cycle = currentCycle(card, today)
  const d = detail(card, expenses, periodForPurchase(card, cycle.closingDate))
  return {
    card,
    cycle,
    ars: d.ars,
    usd: d.usd,
    count: d.items.length,
    shouldAlert: cycle.isClosed && cycle.daysToDue <= card.remindDaysBefore && (d.ars > 0 || d.usd > 0),
  }
}

export interface StatementPeriod {
  /** Cierre anterior (excluido): el resumen incluye compras posteriores a esta fecha */
  previousClosingDate: string
  /** Cierre (incluido) */
  closingDate: string
  dueDate: string
}

/** Meses desde el año 0, para comparar resúmenes por el mes en que cierran. */
const monthIndex = (iso: string) => {
  const p = parts(iso)
  return p.y * 12 + p.m0
}

/** Resumen que cierra en el mes `idx` (ver `monthIndex`). */
function periodByClosingMonth(card: CreditCard, idx: number): StatementPeriod {
  const y = Math.floor(idx / 12)
  const m0 = idx % 12
  const sameMonth = card.dueDay > card.closingDay
  return {
    previousClosingDate: dayIn(y, m0 - 1, card.closingDay),
    closingDate: dayIn(y, m0, card.closingDay),
    dueDate: dayIn(y, sameMonth ? m0 : m0 + 1, card.dueDay),
  }
}

/** Mes de cierre del resumen en el que entra una compra hecha en `date`. */
function closingMonthFor(card: CreditCard, date: string): number {
  const p = parts(date)
  return date > dayIn(p.y, p.m0, card.closingDay) ? monthIndex(date) + 1 : monthIndex(date)
}

/** Resumen en el que entra una compra hecha en `date` (misma convención que `currentCycle`). */
export function periodForPurchase(card: CreditCard, date: string): StatementPeriod {
  return periodByClosingMonth(card, closingMonthFor(card, date))
}

/** Resúmenes de la primera y la última cuota de una compra. */
export function installmentPeriods(card: CreditCard, date: string, n: number): { first: StatementPeriod; last: StatementPeriod } {
  const idx = closingMonthFor(card, date)
  return { first: periodByClosingMonth(card, idx), last: periodByClosingMonth(card, idx + Math.max(n, 1) - 1) }
}

/** Vencimiento del resumen en el que cae la cuota `k` (0 = primera o pago único) de una compra hecha en `date`. */
export function chargeDueDate(card: CreditCard, date: string, k = 0): string {
  return periodByClosingMonth(card, closingMonthFor(card, date) + k).dueDate
}

/** Lo que una compra aporta a un resumen: la compra entera o una de sus cuotas. */
export interface StatementCharge {
  expense: Expense
  /** Número de cuota (1 si es en un pago) */
  number: number
  /** Total de cuotas */
  of: number
  ars: number
  usd: number
}

export interface StatementDetail extends StatementPeriod {
  ars: number
  usd: number
  /** Compras y cuotas del resumen, de la compra más nueva a la más vieja */
  items: StatementCharge[]
}

function detail(card: CreditCard, expenses: Expense[], period: StatementPeriod): StatementDetail {
  const target = monthIndex(period.closingDate)
  const items: StatementCharge[] = []
  let ars = 0
  let usd = 0
  for (const e of expenses) {
    if (e.paymentMethod !== 'credito' || e.cardId !== card.id) continue
    const n = installmentsOf(e)
    const k = target - closingMonthFor(card, e.date)
    if (k < 0 || k >= n) continue
    const isUsd = e.currency === 'USD'
    const charge: StatementCharge = {
      expense: e,
      number: k + 1,
      of: n,
      ars: isUsd ? 0 : installmentAmount(e.amount, n, k),
      usd: isUsd ? (e.originalAmount ?? 0) : 0,
    }
    ars += charge.ars
    usd += charge.usd
    items.push(charge)
  }
  items.sort((a, b) => b.expense.date.localeCompare(a.expense.date) || b.expense.createdAt.localeCompare(a.expense.createdAt))
  return { ...period, ars, usd, items }
}

export interface CardOverview {
  card: CreditCard
  /** Resumen cerrado que todavía no venció. null si el último ya venció. */
  toPay: (StatementDetail & { daysToDue: number }) | null
  /** Resumen abierto que se está armando */
  open: StatementDetail
  /** Resúmenes siguientes al abierto que ya tienen cuotas comprometidas */
  upcoming: StatementDetail[]
  /** Si no hay nada a pagar: cuándo venció el último resumen */
  lastDueDate: string
  shouldAlert: boolean
}

/** Cuotas que ya caen en resúmenes posteriores al abierto. */
function upcomingAfter(card: CreditCard, expenses: Expense[], openClosingIdx: number): StatementDetail[] {
  let lastIdx = openClosingIdx
  for (const e of expenses) {
    if (e.paymentMethod !== 'credito' || e.cardId !== card.id) continue
    const n = installmentsOf(e)
    if (n > 1) lastIdx = Math.max(lastIdx, closingMonthFor(card, e.date) + n - 1)
  }
  const out: StatementDetail[] = []
  for (let idx = openClosingIdx + 1; idx <= lastIdx; idx++) {
    const d = detail(card, expenses, periodByClosingMonth(card, idx))
    if (d.items.length) out.push(d)
  }
  return out
}

/** Los resúmenes que importan: el cerrado que vence pronto, el que está en curso y las cuotas que vienen. */
export function cardOverview(card: CreditCard, expenses: Expense[], today = todayISO()): CardOverview {
  const cycle = currentCycle(card, today)
  const currentIdx = monthIndex(cycle.closingDate)
  const openIdx = cycle.isClosed ? currentIdx + 1 : currentIdx
  const open = detail(card, expenses, periodByClosingMonth(card, openIdx))
  const upcoming = upcomingAfter(card, expenses, openIdx)
  if (cycle.isClosed) {
    const toPay = { ...detail(card, expenses, periodByClosingMonth(card, currentIdx)), daysToDue: cycle.daysToDue }
    return {
      card,
      toPay,
      open,
      upcoming,
      lastDueDate: cycle.dueDate,
      shouldAlert: cycle.daysToDue <= card.remindDaysBefore && (toPay.ars > 0 || toPay.usd > 0),
    }
  }
  return {
    card,
    toPay: null,
    open,
    upcoming,
    lastDueDate: periodByClosingMonth(card, currentIdx - 1).dueDate,
    shouldAlert: false,
  }
}

/**
 * Link para crear en Google Calendar un evento mensual de recordatorio,
 * `remindDaysBefore` días antes del vencimiento.
 */
export function googleCalendarLink(card: CreditCard, today = todayISO()): string {
  const { dueDate } = currentCycle(card, today)
  const due = parts(dueDate)
  const reminder = new Date(due.y, due.m0, due.d - card.remindDaysBefore)
  const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  const next = new Date(reminder.getFullYear(), reminder.getMonth(), reminder.getDate() + 1)
  const text = `💳 Pagar dólares de ${card.name}`
  const details = [
    `El resumen de ${card.name} vence el día ${card.dueDay}.`,
    card.autoDebit
      ? 'Si tenés consumos en USD, pagalos en dólares antes del débito automático para no pagarlos al dólar tarjeta.'
      : 'Acordate de pagar el resumen antes del vencimiento.',
    'Revisá el monto en Cuentas Claras.',
  ].join('\n')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text,
    details,
    dates: `${ymd(reminder)}/${ymd(next)}`,
    recur: `RRULE:FREQ=MONTHLY;BYMONTHDAY=${reminder.getDate()}`,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
