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

export interface StatementSummary {
  card: CreditCard
  cycle: CardCycle
  /** Total en pesos de consumos en ARS */
  ars: number
  /** Total en dólares de consumos en USD */
  usd: number
  count: number
  /** Toca avisar: estamos dentro de los días de anticipación configurados */
  shouldAlert: boolean
}

export function statementFor(card: CreditCard, expenses: Expense[], today = todayISO()): StatementSummary {
  const cycle = currentCycle(card, today)
  let ars = 0
  let usd = 0
  let count = 0
  for (const e of expenses) {
    if (e.paymentMethod !== 'credito' || e.cardId !== card.id) continue
    if (e.date <= cycle.previousClosingDate || e.date > cycle.closingDate) continue
    count++
    if (e.currency === 'USD') usd += e.originalAmount ?? 0
    else ars += e.amount
  }
  return {
    card,
    cycle,
    ars,
    usd,
    count,
    shouldAlert: cycle.isClosed && cycle.daysToDue <= card.remindDaysBefore && (ars > 0 || usd > 0),
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
