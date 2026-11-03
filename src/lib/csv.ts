import type { Category, Expense } from '../types'
import { installmentsOf } from './cards'

/**
 * Exportación pensada para Power BI: un modelo estrella chico.
 *  - gastos.csv      → tabla de hechos (una fila por gasto)
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

export function expensesToCsv(expenses: Expense[]): string {
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date))
  return toCsv(
    ['id', 'fecha', 'monto', 'categoria_id', 'descripcion', 'medio_pago', 'moneda', 'monto_original', 'tarjeta_id', 'cuotas'],
    sorted.map((e) => [
      e.id,
      e.date,
      e.amount.toFixed(2),
      e.categoryId,
      e.description,
      e.paymentMethod,
      e.currency ?? 'ARS',
      e.currency === 'USD' && e.originalAmount != null ? e.originalAmount.toFixed(2) : '',
      e.cardId ?? '',
      installmentsOf(e),
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
