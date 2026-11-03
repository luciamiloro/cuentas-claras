import type { MonthKey } from '../types'

const arsInt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const arsDec = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 })

const arsCompact = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Sin decimales si es entero; si tiene centavos, siempre dos ($ 12.500,50). */
export const formatARS = (n: number) =>
  Math.abs(n - Math.round(n)) < 0.005 ? arsInt.format(Math.round(n)) : arsDec.format(n)
const usd = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', currencyDisplay: 'code', minimumFractionDigits: 0, maximumFractionDigits: 2 })
/** "USD 12,50" — en es-AR el símbolo US$ se confunde fácil con $ */
export const formatUSD = (n: number) => usd.format(n).replace(/\u00a0/g, ' ')
export const formatARSCompact = (n: number) => arsCompact.format(n)

export const formatPct = (n: number, digits = 0) =>
  `${(n * 100).toLocaleString('es-AR', { maximumFractionDigits: digits })}%`

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function monthLabel(key: MonthKey, short = false): string {
  const [y, m] = key.split('-').map(Number)
  const name = MONTHS[m - 1]
  if (short) return `${name.slice(0, 3)} ${String(y).slice(2)}`
  return `${name[0].toUpperCase()}${name.slice(1)} ${y}`
}

export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' })
}

/** "25 nov" */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '')
}

/**
 * Acepta formatos argentinos y anglos: "12.500", "12.500,50", "12500.5", "$ 3.000".
 * Devuelve NaN si no es un número válido.
 */
export function parseAmount(raw: string): number {
  let s = raw.replace(/[^\d.,-]/g, '').trim()
  if (!s) return NaN
  if (s.includes(',')) {
    // coma = decimal, puntos = miles
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "12.500" o "1.250.000" → miles
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}
