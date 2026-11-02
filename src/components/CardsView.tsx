import { useState, type FormEvent } from 'react'
import type { CreditCard, Expense } from '../types'
import { googleCalendarLink, statementFor, type StatementSummary } from '../lib/cards'
import { formatARS, formatUSD, parseAmount } from '../lib/format'
import { newId } from '../lib/settings'

interface Props {
  cards: CreditCard[]
  expenses: Expense[]
  usdCardRate: number | null
  usdCardRateSource: 'api' | 'manual' | null
  onSaveCards: (cards: CreditCard[]) => Promise<boolean>
  onSaveManualRate: (rate: number | null) => void
}

const longDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export function CardsView({ cards, expenses, usdCardRate, usdCardRateSource, onSaveCards, onSaveManualRate }: Props) {
  const [editing, setEditing] = useState<CreditCard | 'new' | null>(cards.length ? null : 'new')
  const statements = cards.map((c) => statementFor(c, expenses))

  async function save(card: CreditCard) {
    const exists = cards.some((c) => c.id === card.id)
    const ok = await onSaveCards(exists ? cards.map((c) => (c.id === card.id ? card : c)) : [...cards, card])
    if (ok) setEditing(null)
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Tus tarjetas</h2>
          {editing === null && (
            <button className="btn small" onClick={() => setEditing('new')}>+ Agregar tarjeta</button>
          )}
        </div>
        <p className="section-lead">
          Te avisamos antes del vencimiento cuánto tenés en <strong>dólares</strong> en el resumen. Si la tarjeta se debita sola de tu cuenta en pesos, esos dólares se cobran al dólar tarjeta. Pagarlos antes con tus dólares suele salir más barato.
        </p>

        {editing && (
          <CardForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? null : editing}
            onCancel={cards.length ? () => setEditing(null) : undefined}
            onSave={save}
            onDelete={
              editing !== 'new'
                ? async () => {
                    const ok = await onSaveCards(cards.filter((c) => c.id !== editing.id))
                    if (ok) setEditing(null)
                  }
                : undefined
            }
          />
        )}

        {statements.length > 0 && (
          <ul className="card-list">
            {statements.map((s) => (
              <CardRow key={s.card.id} s={s} usdCardRate={usdCardRate} onEdit={() => setEditing(s.card)} />
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Dólar tarjeta</h2>
          {usdCardRate && <span className="muted small">{usdCardRateSource === 'api' ? 'Cotización de hoy (DolarApi)' : 'Cargada a mano'}</span>}
        </div>
        <RateEditor value={usdCardRate} onSave={onSaveManualRate} />
        <p className="footnote">
          Se usa para pasar a pesos los gastos en dólares. Por defecto tomamos la cotización del día (DolarApi). Si cargás una a mano, usamos esa; dejá el campo vacío y guardá para volver a la automática.
        </p>
      </section>
    </div>
  )
}

function CardRow({ s, usdCardRate, onEdit }: { s: StatementSummary; usdCardRate: number | null; onEdit: () => void }) {
  const { card, cycle } = s
  const urgent = s.shouldAlert
  const status = cycle.isClosed
    ? cycle.daysToDue === 0
      ? 'Vence hoy'
      : `Vence en ${cycle.daysToDue} ${cycle.daysToDue === 1 ? 'día' : 'días'}`
    : `Resumen abierto · cierra el ${shortDate(cycle.closingDate)}`

  return (
    <li className={`card-item ${urgent ? 'is-urgent' : ''}`}>
      <div className="card-item-head">
        <div>
          <strong className="card-name">💳 {card.name}</strong>
          <span className="card-meta">
            Cierra el {card.closingDay} · vence el {card.dueDay}
            {card.autoDebit ? ' · débito automático' : ''}
          </span>
        </div>
        <span className={`pill ${urgent ? 'warn' : cycle.isClosed ? 'info' : ''}`}>
          {urgent && <span aria-hidden>⚠ </span>}
          {status}
        </span>
      </div>

      <div className="card-figures">
        <div>
          <span className="kpi-label">{cycle.isClosed ? `Resumen que vence el ${shortDate(cycle.dueDate)}` : 'Lo que llevás en este resumen'}</span>
          <span className="fig">{formatARS(s.ars)}</span>
        </div>
        <div>
          <span className="kpi-label">En dólares</span>
          <span className={`fig ${s.usd > 0 ? 'usd' : ''}`}>{formatUSD(s.usd)}</span>
          {s.usd > 0 && usdCardRate && <span className="kpi-sub">≈ {formatARS(Math.round(s.usd * usdCardRate))} al dólar tarjeta</span>}
        </div>
      </div>

      {s.usd > 0 && cycle.isClosed && card.autoDebit && (
        <p className="card-tip">
          Pagá los <strong>{formatUSD(s.usd)}</strong> con dólares antes del {longDate(cycle.dueDate)}, así el débito automático sólo cobra los pesos.
        </p>
      )}

      <div className="card-actions">
        <a className="btn small" href={googleCalendarLink(card)} target="_blank" rel="noreferrer">
          Recordatorio en Google Calendar
        </a>
        <button className="link" onClick={onEdit}>Editar</button>
      </div>
      <p className="footnote">
        Compras del {shortDate(s.cycle.previousClosingDate)} (excl.) al {shortDate(s.cycle.closingDate)}. Las fechas de cierre y vencimiento cambian un poco cada mes: chequealas en tu resumen y ajustalas si hace falta.
      </p>
    </li>
  )
}

function CardForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: CreditCard | null
  onSave: (c: CreditCard) => void
  onCancel?: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [closingDay, setClosingDay] = useState(String(initial?.closingDay ?? 25))
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? 5))
  const [autoDebit, setAutoDebit] = useState(initial?.autoDebit ?? true)
  const [remind, setRemind] = useState(String(initial?.remindDaysBefore ?? 3))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    const c = Number(closingDay)
    const d = Number(dueDay)
    const r = Number(remind)
    if (!name.trim()) return setError('Ponele un nombre, por ejemplo "Visa Galicia".')
    if (!(c >= 1 && c <= 31 && d >= 1 && d <= 31)) return setError('Los días tienen que estar entre 1 y 31.')
    onSave({
      id: initial?.id ?? newId(),
      name: name.trim(),
      closingDay: c,
      dueDay: d,
      autoDebit,
      remindDaysBefore: Math.min(Math.max(r || 0, 0), 15),
    })
  }

  return (
    <form className="subform" onSubmit={submit} noValidate>
      <h3>{initial ? `Editar ${initial.name}` : 'Nueva tarjeta'}</h3>
      <label className="field">
        <span className="field-label">Nombre</span>
        <input id="card-name" placeholder="Ej: Visa Galicia" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="row-3">
        <label className="field">
          <span className="field-label">Día de cierre</span>
          <input id="card-closing" type="number" min={1} max={31} value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Día de vencimiento</span>
          <input id="card-due" type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Avisar días antes</span>
          <input id="card-remind" type="number" min={0} max={15} value={remind} onChange={(e) => setRemind(e.target.value)} />
        </label>
      </div>
      <label className="check">
        <input id="card-autodebit" type="checkbox" checked={autoDebit} onChange={(e) => setAutoDebit(e.target.checked)} />
        Tiene débito automático en una cuenta en pesos
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="subform-actions">
        <button className="btn primary small" type="submit">Guardar tarjeta</button>
        {onCancel && <button className="link" type="button" onClick={onCancel}>Cancelar</button>}
        {onDelete &&
          (confirmDelete ? (
            <span className="confirm">
              ¿Borrar la tarjeta?
              <button className="btn small danger" type="button" onClick={onDelete}>Sí, borrar</button>
              <button className="link" type="button" onClick={() => setConfirmDelete(false)}>No</button>
            </span>
          ) : (
            <button className="link danger-text push-right" type="button" onClick={() => setConfirmDelete(true)}>Borrar</button>
          ))}
      </div>
    </form>
  )
}

export function RateEditor({ value, onSave, label = 'Cotización manual' }: { value: number | null; onSave: (v: number | null) => void; label?: string }) {
  const [draft, setDraft] = useState(value ? String(value).replace('.', ',') : '')
  return (
    <form
      className="rate-editor"
      onSubmit={(e) => {
        e.preventDefault()
        const n = parseAmount(draft)
        onSave(Number.isFinite(n) && n > 0 ? n : null)
      }}
    >
      <span className="big-rate">{value ? formatARS(value) : '—'}</span>
      <label className="sr-only" htmlFor={`rate-${label}`}>{label}</label>
      <input id={`rate-${label}`} inputMode="decimal" placeholder="Ej: 1.480" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button className="btn small" type="submit">Guardar</button>
    </form>
  )
}
