import { useMemo, useState } from 'react'
import type { CreditCard, Expense } from '../types'
import { PAYMENT_METHODS } from '../types'
import type { CategoryLookup } from '../lib/categories'
import { dayLabel, formatARS, formatUSD, shortDate } from '../lib/format'
import type { LedgerEntry } from '../lib/stats'

interface Props {
  /** Movimientos imputados al mes (crédito con tarjeta: por vencimiento); las cuotas vienen de a una por fila */
  expenses: LedgerEntry[]
  /** Resuelve categorías de fábrica y propias (archivadas incluidas) */
  getCategory: CategoryLookup
  /** Para mostrar el nombre de la tarjeta en los gastos a crédito */
  cards: CreditCard[]
  categoryFilter: string | null
  onClearFilter: () => void
  onEdit: (e: LedgerEntry) => void
  onDelete: (id: string) => void
  editingId: string | null
}

const methodLabel = new Map(PAYMENT_METHODS.map((m) => [m.id, m.label]))

export function ExpenseList({ expenses, getCategory, cards, categoryFilter, onClearFilter, onEdit, onDelete, editingId }: Props) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const LIMIT = 12

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return expenses
      .filter((e) => !categoryFilter || e.categoryId === categoryFilter)
      .filter((e) => !q || e.description.toLowerCase().includes(q) || getCategory(e.categoryId).name.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }, [expenses, categoryFilter, query, getCategory])

  const cardName = useMemo(() => new Map(cards.map((c) => [c.id, c.name])), [cards])
  /** Gasto a crédito sin tarjeta (o con una que ya se borró): se puede editar para asignarle una */
  const hasNoCard = (e: Expense) => e.paymentMethod === 'credito' && !(e.cardId && cardName.has(e.cardId))
  /** "Visa Santander 4168" para crédito con tarjeta; si no, el medio de pago */
  const methodText = (e: Expense) =>
    (e.paymentMethod === 'credito' && e.cardId && cardName.get(e.cardId)) ||
    (methodLabel.get(e.paymentMethod) ?? e.paymentMethod)

  const visibleTotal = visible.reduce((a, e) => a + e.amount, 0)
  const filterCat = categoryFilter ? getCategory(categoryFilter) : null

  return (
    <section className="card">
      <div className="card-head">
        <h2>Movimientos</h2>
        <input
          className="search"
          type="search"
          placeholder="Buscar…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar movimientos"
        />
      </div>

      {filterCat && (
        <div className="filter-pill">
          Filtrando: <span aria-hidden>{filterCat.emoji}</span> {filterCat.name}
          <button className="link" onClick={onClearFilter} aria-label="Quitar filtro">✕</button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="empty">{expenses.length ? 'Nada coincide con el filtro.' : 'Sin movimientos este mes.'}</p>
      ) : (
        <>
          <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th scope="col" className="date-col">Fecha</th>
                <th scope="col">Detalle</th>
                <th scope="col" className="num">Monto</th>
                <th scope="col"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? visible : visible.slice(0, LIMIT)).map((e) => {
                const c = getCategory(e.categoryId)
                const inst = e.installment
                const realId = inst?.sourceId ?? e.id
                const label = e.description || c.name
                // Compra de otro mes que se paga en este (resumen de tarjeta): se ve el mes
                const dateText = e.date.startsWith(e.month) ? dayLabel(e.date) : shortDate(e.date)
                return (
                  <tr key={e.id} className={editingId === realId ? 'is-editing' : ''}>
                    <td className="date date-col">{dateText}</td>
                    <td>
                      <div className="detail">
                        <span className="detail-main">
                          <span aria-hidden>{c.emoji}</span> {label}
                          {inst && (
                            <span className="cuota-tag">
                              Cuota {inst.number}/{inst.of}
                            </span>
                          )}
                        </span>
                        <span className="detail-sub">
                          {/* En el celu la columna Fecha se oculta y la fecha va acá */}
                          <span className="date-inline">{dateText} · </span>
                          {inst && inst.number > 1 && !e.dueDate ? `Compra del ${shortDate(inst.sourceDate)} · ` : ''}
                          {e.dueDate ? `Vence ${shortDate(e.dueDate)} · ` : ''}
                          {e.description ? `${c.name} · ` : ''}
                          {hasNoCard(e) ? (
                            <button
                              type="button"
                              className="link no-card"
                              onClick={() => onEdit(e)}
                              title="Editar para asignarle una tarjeta"
                            >
                              Crédito · sin tarjeta
                            </button>
                          ) : (
                            methodText(e)
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="num">
                      {formatARS(e.amount)}
                      {e.currency === 'USD' && e.originalAmount != null && (
                        <span className="usd-tag">{formatUSD(e.originalAmount)}</span>
                      )}
                      {inst && <span className="usd-tag">de {formatARS(inst.total)} en total</span>}
                    </td>
                    <td className="actions">
                      <button
                        className="icon-btn"
                        onClick={() => onEdit(e)}
                        aria-label={inst ? `Editar la compra ${label} (${inst.of} cuotas)` : `Editar ${label}`}
                        title={inst ? 'Editar la compra' : 'Editar'}
                      >
                        ✎
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => onDelete(realId)}
                        aria-label={inst ? `Borrar la compra ${label} con sus ${inst.of} cuotas` : `Borrar ${label}`}
                        title={inst ? `Borrar la compra (las ${inst.of} cuotas)` : 'Borrar'}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                {/* Sin colSpan: en el celu la columna Fecha desaparece y el total tiene que seguir bajo "Monto" */}
                <td className="date-col" />
                <td>{visible.length} {visible.length === 1 ? 'movimiento' : 'movimientos'}</td>
                <td className="num">{formatARS(visibleTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          </div>
          {visible.length > LIMIT && (
            <button className="btn ghost show-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Mostrar menos' : `Ver los ${visible.length} movimientos`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
