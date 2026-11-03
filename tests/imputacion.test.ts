// Imputación de gastos a crédito al mes de vencimiento de su resumen.
// Correr con: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CreditCard, Expense } from '../src/types'
import { buildLedger, expensesInMonth, monthlyTotals, summarize, totalsByCategory } from '../src/lib/stats'

// Tarjeta que cierra el 29 y vence el 11 (del mes siguiente)
const card: CreditCard = { id: 'visa', name: 'Visa', closingDay: 29, dueDay: 11, autoDebit: true, remindDaysBefore: 3 }

// Compra del 21/10/2026 en dólares con esa tarjeta
const compraUsd: Expense = {
  id: 'usd',
  date: '2026-10-21',
  amount: 150000,
  categoryId: 'suscripciones',
  description: 'Compra en USD',
  paymentMethod: 'credito',
  createdAt: '2026-10-21T12:00:00Z',
  currency: 'USD',
  originalAmount: 100,
  cardId: 'visa',
}

const now = new Date(2026, 10, 2) // 2 nov 2026

test('compra en USD del 21/10 (cierra 29/10, vence 11/11) se imputa a noviembre', () => {
  const ledger = buildLedger([compraUsd], [card])
  assert.equal(ledger.length, 1)
  assert.equal(ledger[0].month, '2026-11')
  assert.equal(ledger[0].dueDate, '2026-11-11')
  assert.equal(ledger[0].date, '2026-10-21', 'la fecha de compra no cambia')

  // Lista del mes
  assert.deepEqual(expensesInMonth(ledger, '2026-10'), [])
  assert.deepEqual(expensesInMonth(ledger, '2026-11').map((e) => e.id), ['usd'])

  // KPIs (y el presupuesto, que usa summary.total)
  assert.equal(summarize(ledger, '2026-10', undefined, now).total, 0)
  const nov = summarize(ledger, '2026-11', undefined, now)
  assert.equal(nov.total, 150000)
  assert.equal(nov.count, 1)
  assert.equal(nov.previousTotal, 0)

  // Ranking por categoría
  assert.deepEqual(totalsByCategory(ledger, '2026-10'), [])
  const rank = totalsByCategory(ledger, '2026-11')
  assert.equal(rank.length, 1)
  assert.equal(rank[0].total, 150000)

  // Tendencia de 6 meses
  const trend = monthlyTotals(ledger, '2026-11', 6)
  assert.equal(trend.find((t) => t.month === '2026-10')?.total, 0)
  assert.equal(trend.find((t) => t.month === '2026-11')?.total, 150000)
})

test('compra el mismo día del cierre entra en ese resumen; el día siguiente, en el próximo', () => {
  const ledger = buildLedger(
    [
      { ...compraUsd, id: 'cierre', date: '2026-10-29' },
      { ...compraUsd, id: 'despues', date: '2026-10-30' },
    ],
    [card],
  )
  assert.equal(ledger.find((e) => e.id === 'cierre')?.month, '2026-11')
  assert.equal(ledger.find((e) => e.id === 'despues')?.month, '2026-12')
})

test('cuotas con tarjeta: una por mes desde el vencimiento del primer resumen', () => {
  const ledger = buildLedger(
    [{ ...compraUsd, id: 'cuotas', currency: 'ARS', originalAmount: null, amount: 20000, installments: 4 }],
    [card],
  )
  assert.deepEqual(
    ledger.map((e) => [e.month, e.amount, e.installment?.number]),
    [
      ['2026-11', 5000, 1],
      ['2026-12', 5000, 2],
      ['2027-01', 5000, 3],
      ['2027-02', 5000, 4],
    ],
  )
})

test('sin tarjeta (o con una que ya no existe) y otros medios de pago: mes de la compra', () => {
  const ledger = buildLedger(
    [
      { ...compraUsd, id: 'sin-tarjeta', cardId: null },
      { ...compraUsd, id: 'borrada', cardId: 'no-existe' },
      { ...compraUsd, id: 'debito', paymentMethod: 'debito', cardId: null, currency: 'ARS' },
    ],
    [card],
  )
  for (const e of ledger) assert.equal(e.month, '2026-10', e.id)
})
