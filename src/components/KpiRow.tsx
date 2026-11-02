import { useState } from 'react'
import type { MonthSummary } from '../lib/stats'
import { formatARS, formatPct, parseAmount } from '../lib/format'

interface Props {
  summary: MonthSummary
  budget: number | null
  isCurrentMonth: boolean
  onBudgetChange: (value: number | null) => void
}

export function KpiRow({ summary, budget, isCurrentMonth, onBudgetChange }: Props) {
  const { total, delta, dailyAverage, count, fixed, variable, top } = summary

  return (
    <section className="kpis" aria-label="Resumen del mes">
      <div className="kpi hero">
        <span className="kpi-label">Gastado en el mes</span>
        <span className="kpi-value">{formatARS(total)}</span>
        <span className="kpi-sub">
          {count} {count === 1 ? 'movimiento' : 'movimientos'}
          {delta !== null && <Delta value={delta} />}
        </span>
        <BudgetMeter total={total} budget={budget} onChange={onBudgetChange} />
      </div>

      <div className="kpi">
        <span className="kpi-label">{isCurrentMonth ? 'Promedio por día (hasta hoy)' : 'Promedio por día'}</span>
        <span className="kpi-value sm">{formatARS(Math.round(dailyAverage))}</span>
      </div>

      <div className="kpi">
        <span className="kpi-label">Donde más se fue</span>
        {top ? (
          <>
            <span className="kpi-value sm">
              <span aria-hidden>{top.category.emoji}</span> {top.category.name}
            </span>
            <span className="kpi-sub">
              {formatARS(top.total)} · {formatPct(top.share)} del mes
            </span>
          </>
        ) : (
          <span className="kpi-value sm muted">—</span>
        )}
      </div>

      <div className="kpi">
        <span className="kpi-label">Fijos vs variables</span>
        {total > 0 ? (
          <>
            <div className="split" role="img" aria-label={`Fijos ${formatPct(fixed / total)}, variables ${formatPct(variable / total)}`}>
              <span className="split-fixed" style={{ flexGrow: fixed }} />
              <span className="split-var" style={{ flexGrow: variable }} />
            </div>
            <span className="kpi-sub split-legend">
              <span><i className="dot fixed" /> Fijos {formatPct(fixed / total)}</span>
              <span><i className="dot var" /> Variables {formatPct(variable / total)}</span>
            </span>
          </>
        ) : (
          <span className="kpi-value sm muted">—</span>
        )}
      </div>
    </section>
  )
}

function Delta({ value }: { value: number }) {
  const up = value > 0
  if (Math.abs(value) < 0.005) return <span className="delta flat">igual que el mes anterior</span>
  return (
    <span className={`delta ${up ? 'up' : 'down'}`}>
      <span aria-hidden>{up ? '▲' : '▼'}</span> {formatPct(Math.abs(value))} {up ? 'más' : 'menos'} que el mes anterior
    </span>
  )
}

function BudgetMeter({
  total,
  budget,
  onChange,
}: {
  total: number
  budget: number | null
  onChange: (v: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (editing) {
    return (
      <form
        className="budget-edit"
        onSubmit={(e) => {
          e.preventDefault()
          const n = parseAmount(draft)
          onChange(Number.isFinite(n) && n > 0 ? n : null)
          setEditing(false)
        }}
      >
        <input
          autoFocus
          inputMode="decimal"
          placeholder="Presupuesto mensual"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Presupuesto mensual"
        />
        <button className="btn small" type="submit">OK</button>
        <button className="link" type="button" onClick={() => setEditing(false)}>Cancelar</button>
      </form>
    )
  }

  if (!budget) {
    return (
      <button className="link budget-cta" onClick={() => { setDraft(''); setEditing(true) }}>
        + Definir presupuesto mensual
      </button>
    )
  }

  const ratio = total / budget
  const state = ratio >= 1 ? 'over' : ratio >= 0.85 ? 'near' : 'ok'
  return (
    <div className="budget">
      <div
        className={`meter ${state}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={total}
        aria-label="Uso del presupuesto"
      >
        <span style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      </div>
      <span className="kpi-sub">
        {state === 'over' ? (
          <>⚠ Te pasaste {formatARS(total - budget)} del presupuesto de {formatARS(budget)}</>
        ) : (
          <>
            {formatPct(ratio)} de {formatARS(budget)} · quedan {formatARS(budget - total)}
          </>
        )}{' '}
        <button className="link" onClick={() => { setDraft(String(budget)); setEditing(true) }}>
          editar
        </button>
      </span>
    </div>
  )
}
