import { useMemo, useState } from 'react'
import type { Expense } from '../types'
import { PAYMENT_METHODS } from '../types'
import { getCategory } from '../lib/categories'
import { dayLabel, formatARS, formatUSD } from '../lib/format'

interface Props {
  expenses: Expense[]
  categoryFilter: string | null
  onClearFilter: () => void
  onEdit: (e: Expense) => void
  onDelete: (id: string) => void
  editingId: string | null
}

const methodLabel = new Map(PAYMENT_METHODS.map((m) => [m.id, m.label]))

export function ExpenseList({ expenses, categoryFilter, onClearFilter, onEdit, onDelete, editingId }: Props) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const LIMIT = 12

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return expenses
      .filter((e) => !categoryFilter || e.categoryId === categoryFilter)
      .filter((e) => !q || e.description.toLowerCase().includes(q) || getCategory(e.categoryId).name.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }, [expenses, categoryFilter, query])

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
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Detalle</th>
                <th scope="col" className="num">Monto</th>
                <th scope="col"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? visible : visible.slice(0, LIMIT)).map((e) => {
                const c = getCategory(e.categoryId)
                return (
                  <tr key={e.id} className={editingId === e.id ? 'is-editing' : ''}>
                    <td className="date">{dayLabel(e.date)}</td>
                    <td>
                      <div className="detail">
                        <span className="detail-main">
                          <span aria-hidden>{c.emoji}</span> {e.description || c.name}
                        </span>
                        <span className="detail-sub">
                          {e.description ? `${c.name} · ` : ''}
                          {methodLabel.get(e.paymentMethod) ?? e.paymentMethod}
                        </span>
                      </div>
                    </td>
                    <td className="num">
                      {formatARS(e.amount)}
                      {e.currency === 'USD' && e.originalAmount != null && (
                        <span className="usd-tag">{formatUSD(e.originalAmount)}</span>
                      )}
                    </td>
                    <td className="actions">
                      <button className="icon-btn" onClick={() => onEdit(e)} aria-label={`Editar ${e.description || c.name}`} title="Editar">✎</button>
                      <button className="icon-btn" onClick={() => onDelete(e.id)} aria-label={`Borrar ${e.description || c.name}`} title="Borrar">🗑</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{visible.length} {visible.length === 1 ? 'movimiento' : 'movimientos'}</td>
                <td className="num">{formatARS(visibleTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
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
