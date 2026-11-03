import type { Category, CreditCard, Expense } from '../types'
import { buildLedger } from './stats'

/**
 * Exportación pensada para Power BI: un modelo estrella chico.
 *  - gastos.csv      → tabla de hechos: una fila por gasto y por mes en que se paga
 *                      (igual que la pantalla Gastos: crédito con tarjeta al mes de
 *                      vencimiento del resumen; las cuotas, una fila cada una)
 *  - categorias.csv  → dimensión de categorías
 * Separador coma, decimales con punto y fechas ISO, así Power Query no depende
 * de la configuración regional de la máquina.
 */

const escape = (v: string | number) => {
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const toCsv = (header: string[], rows: (string | number)[][]) =>
  [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n') + '\r\n'

/**
 * Columnas (las nuevas, siempre al final, para no romper consultas viejas):
 *  id, fecha (de compra), monto (lo que se imputa al mes: el gasto o la cuota), …, cuotas,
 *  mes (1.er día del mes imputado), vencimiento (sólo crédito con tarjeta), cuota (n.º), monto_total.
 * Clave única: id + cuota.
 */
export function expensesToCsv(expenses: Expense[], cards: CreditCard[] = []): string {
  const rows = buildLedger(expenses, cards).sort(
    (a, b) => a.month.localeCompare(b.month) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  )
  return toCsv(
    [
      'id', 'fecha', 'monto', 'categoria_id', 'descripcion', 'medio_pago', 'moneda', 'monto_original', 'tarjeta_id', 'cuotas',
      'mes', 'vencimiento', 'cuota', 'monto_total',
    ],
    rows.map((e) => [
      e.installment?.sourceId ?? e.id,
      e.installment?.sourceDate ?? e.date,
      e.amount.toFixed(2),
      e.categoryId,
      e.description,
      e.paymentMethod,
      e.currency ?? 'ARS',
      e.currency === 'USD' && e.originalAmount != null ? e.originalAmount.toFixed(2) : '',
      e.cardId ?? '',
      e.installment?.of ?? 1,
      `${e.month}-01`,
      e.dueDate ?? '',
      e.installment?.number ?? 1,
      (e.installment?.total ?? e.amount).toFixed(2),
    ]),
  )
}

export function categoriesToCsv(categories: Category[]): string {
  return toCsv(
    ['categoria_id', 'categoria', 'emoji', 'tipo'],
    categories.map((c) => [c.id, c.name, c.emoji, c.kind]),
  )
}

export function downloadText(filename: string, content: string, mime = 'text/csv') {
  // BOM para que Excel abra bien los acentos; Power BI lo ignora.
  const blob = new Blob(['﻿', content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
