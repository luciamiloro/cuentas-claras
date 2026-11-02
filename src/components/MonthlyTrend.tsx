import { useState } from 'react'
import type { MonthKey } from '../types'
import type { MonthTotal } from '../lib/stats'
import { formatARS, formatARSCompact, monthLabel } from '../lib/format'

interface Props {
  data: MonthTotal[]
  selected: MonthKey
  onSelect: (m: MonthKey) => void
}

function niceMax(v: number) {
  if (v <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag >= v) ?? 10
  return step * mag
}

export function MonthlyTrend({ data, selected, onSelect }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const max = niceMax(Math.max(...data.map((d) => d.total)))
  const ticks = [max, max / 2, 0]
  const avg = data.filter((d) => d.total > 0)
  const average = avg.length ? avg.reduce((a, d) => a + d.total, 0) / avg.length : 0

  return (
    <section className="card">
      <div className="card-head">
        <h2>Últimos {data.length} meses</h2>
        {average > 0 && <span className="muted small">Promedio: {formatARS(Math.round(average))}</span>}
      </div>

      <div className="trend" onMouseLeave={() => setHover(null)}>
        <div className="trend-axis" aria-hidden>
          {ticks.map((t) => (
            <span key={t}>{t === 0 ? '0' : formatARSCompact(t)}</span>
          ))}
        </div>
        <div className="trend-plot">
          {ticks.map((t) => (
            <i key={t} className="gridline" style={{ bottom: `${(t / max) * 100}%` }} aria-hidden />
          ))}
          {average > 0 && (
            <i className="avgline" style={{ bottom: `${(average / max) * 100}%` }} aria-hidden />
          )}
          {data.map((d, i) => {
            const isSel = d.month === selected
            return (
              <button
                key={d.month}
                className={`col ${isSel ? 'is-sel' : ''}`}
                onClick={() => onSelect(d.month)}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${monthLabel(d.month)}: ${formatARS(d.total)}`}
                aria-pressed={isSel}
              >
                <span className="col-bar" style={{ height: `${(d.total / max) * 100}%` }} />
                {hover === i && (
                  <span className="tooltip" role="tooltip">
                    <strong>{monthLabel(d.month)}</strong>
                    {formatARS(d.total)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="trend-labels" aria-hidden>
          {data.map((d) => (
            <span key={d.month} className={d.month === selected ? 'is-sel' : ''}>
              {monthLabel(d.month, true)}
            </span>
          ))}
        </div>
      </div>
      <p className="footnote">Línea punteada: promedio de los meses con gastos. Tocá una barra para ir a ese mes.</p>
    </section>
  )
}
