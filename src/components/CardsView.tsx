import { useState, type FormEvent } from 'react'
import type { CreditCard, Expense } from '../types'
import { cardOverview, googleCalendarLink, type CardOverview, type StatementDetail } from '../lib/cards'
import type { CategoryLookup } from '../lib/categories'
import { formatARS, formatUSD, monthLabel, parseAmount, shortDate } from '../lib/format'
import { newId } from '../lib/settings'

interface Props {
  cards: CreditCard[]
  expenses: Expense[]
  getCategory: CategoryLookup
  usdCardRate: number | null
  usdCardRateSource: 'api' | 'manual' | null
  onSaveCards: (cards: CreditCard[]) => Promise<boolean>
  onSaveManualRate: (rate: number | null) => void
}

const longDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}
export function CardsView({ cards, expenses, getCategory, usdCardRate, usdCardRateSource, onSaveCards, onSaveManualRate }: Props) {
  const [editing, setEditing] = useState<CreditCard | 'new' | null>(cards.length ? null : 'new')
  const overviews = cards.map((c) => cardOverview(c, expenses))
  const unassigned = expenses.filter((e) => e.paymentMethod === 'credito' && !cards.some((c) => c.id === e.cardId)).length

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

        <Commitments overviews={overviews} />

        {overviews.length > 0 && (
          <ul className="card-list">
            {overviews.map((o) => (
              <CardRow
                key={o.card.id}
                o={o}
                getCategory={getCategory}
                usdCardRate={usdCardRate}
                onEdit={() => setEditing(o.card)}
              />
            ))}
          </ul>
        )}

        {cards.length > 0 && unassigned > 0 && (
          <p className="footnote">
            Tenés {unassigned} {unassigned === 1 ? 'gasto' : 'gastos'} con crédito sin tarjeta asignada: no entran en ningún
            resumen. Editalos desde Movimientos (figuran como "Crédito · sin tarjeta").
          </p>
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Cuánto vence en cada mes sumando todas las tarjetas (resumen a pagar, en curso
 * y cuotas futuras), para saber con qué plata contás. Se muestra si hay cuotas.
 */
function Commitments({ overviews }: { overviews: CardOverview[] }) {
  if (!overviews.some((o) => o.upcoming.length > 0)) return null
  const months = new Map<string, { ars: number; usd: number; open: boolean; cards: Map<string, number> }>()
  for (const o of overviews) {
    const stmts = [...(o.toPay ? [{ s: o.toPay, open: false }] : []), { s: o.open, open: true }, ...o.upcoming.map((s) => ({ s, open: false }))]
    for (const { s, open } of stmts) {
      if (!s.items.length) continue
      const key = s.dueDate.slice(0, 7)
      const row = months.get(key) ?? { ars: 0, usd: 0, open: false, cards: new Map() }
      row.ars += s.ars
      row.usd += s.usd
      row.open ||= open
      row.cards.set(o.card.name, (row.cards.get(o.card.name) ?? 0) + s.ars)
      months.set(key, row)
    }
  }
  const rows = [...months.entries()].sort(([a], [b]) => a.localeCompare(b))
  return (
    <div className="commitments">
      <h3>Lo que ya tenés comprometido</h3>
      <ul>
        {rows.map(([month, r]) => (
          <li key={month}>
            <span className="commit-month">Vence en {monthLabel(month)}</span>
            <span className="commit-amt">
              {formatARS(r.ars)}
              {r.usd > 0 && <span className="usd-tag">+ {formatUSD(r.usd)}</span>}
            </span>
            {(r.cards.size > 1 || r.open) && (
              <span className="commit-sub">
                {r.cards.size > 1 && [...r.cards].map(([name, v]) => `${name} ${formatARS(v)}`).join(' · ')}
                {r.cards.size > 1 && r.open ? ' · ' : ''}
                {r.open && 'incluye un resumen todavía abierto'}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CardRow({
  o,
  getCategory,
  usdCardRate,
  onEdit,
}: {
  o: CardOverview
  getCategory: CategoryLookup
  usdCardRate: number | null
  onEdit: () => void
}) {
  const { card, toPay, open } = o
  const urgent = o.shouldAlert
  const status = toPay
    ? toPay.daysToDue === 0
      ? 'Vence hoy'
      : `Vence en ${plural(toPay.daysToDue, 'día', 'días')}`
    : `Cierra el ${shortDate(open.closingDate)}`
  const toPayEmpty = !!toPay && toPay.items.length === 0
  const hint = open.items.length > 0 ? ' Tus compras recientes van al resumen en curso.' : ''

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
        <span className={`pill ${urgent ? 'warn' : toPay && !toPayEmpty ? 'info' : ''}`}>
          {urgent && <span aria-hidden>⚠ </span>}
          {status}
        </span>
      </div>

      <div className="stmt-grid">
        <section className="stmt" aria-label="Resumen a pagar">
          <span className="kpi-label">
            A pagar{toPay ? ` · vence el ${shortDate(toPay.dueDate)}` : ''}
          </span>
          {!toPay ? (
            <p className="stmt-empty">
              Nada pendiente: el último resumen venció el {shortDate(o.lastDueDate)}.{hint}
            </p>
          ) : toPayEmpty ? (
            <p className="stmt-empty">
              No hay compras ni cuotas de esta tarjeta en el resumen que cerró el {shortDate(toPay.closingDate)}.{hint}
            </p>
          ) : (
            <StatementFigures s={toPay} usdCardRate={usdCardRate} getCategory={getCategory} />
          )}
          {toPay && <span className="stmt-dates">Cerró el {shortDate(toPay.closingDate)}</span>}
        </section>

        <section className="stmt is-open" aria-label="Resumen en curso">
          <span className="kpi-label">En curso · hasta hoy</span>
          {open.items.length === 0 ? (
            <p className="stmt-empty">Todavía sin compras en este resumen.</p>
          ) : (
            <StatementFigures s={open} usdCardRate={usdCardRate} getCategory={getCategory} />
          )}
          <span className="stmt-dates">
            Cierra el {shortDate(open.closingDate)} · vence el {shortDate(open.dueDate)}
          </span>
        </section>
      </div>

      {o.upcoming.length > 0 && (
        <details className="stmt-items upcoming">
          <summary>
            Cuotas que vienen: {formatARS(o.upcoming.reduce((a, s) => a + s.ars, 0))} en{' '}
            {plural(o.upcoming.length, 'resumen', 'resúmenes')} más
          </summary>
          <ul>
            {o.upcoming.map((s) => (
              <li key={s.closingDate}>
                <span className="stmt-item-date">{shortDate(s.dueDate)}</span>
                <span className="stmt-item-desc">
                  {s.items
                    .map((i) => `${i.expense.description || getCategory(i.expense.categoryId).name} ${i.number}/${i.of}`)
                    .join(' · ')}
                </span>
                <span className="stmt-item-amt">{formatARS(s.ars)}</span>
              </li>
            ))}
          </ul>
          <p className="footnote">Sólo cuotas ya cargadas: lo que compres de acá en más se suma.</p>
        </details>
      )}

      {toPay && toPay.usd > 0 && card.autoDebit && (
        <p className="card-tip">
          Pagá los <strong>{formatUSD(toPay.usd)}</strong> con dólares antes del {longDate(toPay.dueDate)}, así el débito automático sólo cobra los pesos.
        </p>
      )}

      <div className="card-actions">
        <a className="btn small" href={googleCalendarLink(card)} target="_blank" rel="noreferrer">
          Recordatorio en Google Calendar
        </a>
        <button className="link" onClick={onEdit}>Editar</button>
      </div>
      <p className="footnote">
        Las fechas de cierre y vencimiento cambian un poco cada mes: chequealas en tu resumen y ajustalas si hace falta.
      </p>
    </li>
  )
}

function StatementFigures({
  s,
  usdCardRate,
  getCategory,
}: {
  s: StatementDetail
  usdCardRate: number | null
  getCategory: CategoryLookup
}) {
  return (
    <>
      <span className="fig">{formatARS(s.ars)}</span>
      {s.usd > 0 && (
        <span className="stmt-usd">
          + <strong>{formatUSD(s.usd)}</strong>
          {usdCardRate ? ` (≈ ${formatARS(Math.round(s.usd * usdCardRate))} al dólar tarjeta)` : ''}
        </span>
      )}
      <details className="stmt-items">
        <summary>
          Ver {s.items.some((i) => i.of > 1) ? plural(s.items.length, 'compra o cuota', 'compras y cuotas') : plural(s.items.length, 'compra', 'compras')}
        </summary>
        <ul>
          {s.items.map(({ expense: e, number, of, ars, usd }) => {
            const c = getCategory(e.categoryId)
            return (
              <li key={e.id}>
                <span className="stmt-item-date">{shortDate(e.date)}</span>
                <span className="stmt-item-desc">
                  <span aria-hidden>{c.emoji}</span> {e.description || c.name}
                  {of > 1 && (
                    <span className="stmt-item-cuota">
                      Cuota {number}/{of} · total {formatARS(e.amount)}
                    </span>
                  )}
                </span>
                <span className="stmt-item-amt">{usd > 0 ? formatUSD(usd) : formatARS(ars)}</span>
              </li>
            )
          })}
        </ul>
        <p className="footnote">
          Compras del {shortDate(s.previousClosingDate)} (excl.) al {shortDate(s.closingDate)}.
        </p>
      </details>
    </>
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
