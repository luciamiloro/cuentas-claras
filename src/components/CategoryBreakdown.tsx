import type { CategoryTotal } from '../lib/stats'
import { formatARS, formatPct } from '../lib/format'

interface Props {
  rows: CategoryTotal[]
  selected: string | null
  onSelect: (categoryId: string | null) => void
}

/**
 * Ranking horizontal: es la forma más clara de responder
 * "¿en qué se me va la plata?" — compara magnitudes y entra cualquier
 * cantidad de categorías sin necesitar 15 colores distintos.
 */
export function CategoryBreakdown({ rows, selected, onSelect }: Props) {
  const max = rows[0]?.total ?? 0

  return (
    <section className="card">
      <div className="card-head">
        <h2>¿En qué se va la plata?</h2>
        {selected && (
          <button className="link" onClick={() => onSelect(null)}>
            Ver todas
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="empty">Todavía no hay gastos este mes.</p>
      ) : (
        <ol className="ranking">
          {rows.map((r) => {
            const diff = r.previous > 0 ? (r.total - r.previous) / r.previous : null
            const isSel = selected === r.category.id
            return (
              <li key={r.category.id}>
                <button
                  className={`rank-row ${isSel ? 'is-sel' : ''} ${selected && !isSel ? 'is-dim' : ''}`}
                  onClick={() => onSelect(isSel ? null : r.category.id)}
                  aria-pressed={isSel}
                  title={`${r.count} ${r.count === 1 ? 'gasto' : 'gastos'}${
                    r.previous > 0 ? ` · mes anterior: ${formatARS(r.previous)}` : ''
                  }`}
                >
                  <span className="rank-name">
                    <span aria-hidden>{r.category.emoji}</span> {r.category.name}
                  </span>
                  <span className="rank-bar" aria-hidden>
                    <span style={{ width: `${max ? (r.total / max) * 100 : 0}%` }} />
                  </span>
                  <span className="rank-amount">{formatARS(r.total)}</span>
                  <span className="rank-share">{formatPct(r.share)}</span>
                  <span className={`rank-diff ${diff === null ? '' : diff > 0.005 ? 'up' : diff < -0.005 ? 'down' : ''}`}>
                    {diff === null ? 'nuevo' : Math.abs(diff) < 0.005 ? '=' : `${diff > 0 ? '▲' : '▼'} ${formatPct(Math.abs(diff))}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {rows.length > 0 && <p className="footnote">Tocá una categoría para filtrar los movimientos. ▲▼ vs. mes anterior.</p>}
    </section>
  )
}
