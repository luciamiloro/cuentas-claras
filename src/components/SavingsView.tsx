import { useState, type FormEvent } from 'react'
import type { Currency, SavingsAccount, SavingsKind } from '../types'
import { currentMonth, todayISO } from '../lib/dates'
import { daysBetween } from '../lib/cards'
import { formatARS, formatPct, formatUSD, monthLabel, parseAmount } from '../lib/format'
import { lastKnownMep, latest, monthlyUSD, previous, toUSD, totals } from '../lib/savings'
import { newId } from '../lib/settings'
import { RateEditor } from './CardsView'

interface Props {
  accounts: SavingsAccount[]
  mep: number | null
  mepSource: 'api' | 'manual' | null
  onSave: (accounts: SavingsAccount[]) => Promise<boolean>
  onSaveManualMep: (v: number | null) => void
}

const KINDS: { id: SavingsKind; label: string; emoji: string }[] = [
  { id: 'broker', label: 'Broker / inversiones', emoji: '📈' },
  { id: 'banco', label: 'Banco', emoji: '🏦' },
  { id: 'billetera', label: 'Billetera virtual', emoji: '📱' },
  { id: 'efectivo', label: 'Efectivo', emoji: '💵' },
  { id: 'otro', label: 'Otro', emoji: '📦' },
]
const kindOf = (k: SavingsKind) => KINDS.find((x) => x.id === k) ?? KINDS[4]
const money = (c: Currency, n: number) => (c === 'USD' ? formatUSD(n) : formatARS(n))
const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SavingsView({ accounts, mep, mepSource, onSave, onSaveManualMep }: Props) {
  const [adding, setAdding] = useState(accounts.length === 0)
  const [updating, setUpdating] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  // Si no hay cotización del día ni manual, usamos el último MEP guardado con un saldo
  const fallbackMep = mep ? null : lastKnownMep(accounts)
  const effMep = mep ?? fallbackMep
  const t = totals(accounts, effMep)
  const series = monthlyUSD(accounts, currentMonth(), 12, effMep)
  const hasHistory = series.filter((p) => p.usd > 0).length >= 2
  const prevMonthUsd = series[series.length - 2]?.usd ?? 0
  const monthDelta = t.usd !== null && prevMonthUsd > 0 ? (t.usd - prevMonthUsd) / prevMonthUsd : null

  async function addBalance(acc: SavingsAccount, amount: number, date: string) {
    const history = [...acc.history.filter((h) => h.date !== date), { date, amount, mep: acc.currency === 'ARS' ? effMep : null }].sort(
      (a, b) => a.date.localeCompare(b.date),
    )
    const ok = await onSave(accounts.map((a) => (a.id === acc.id ? { ...a, history } : a)))
    if (ok) setUpdating(null)
  }

  return (
    <div className="stack">
      <section className="kpis savings-kpis" aria-label="Resumen de ahorros">
        <div className="kpi hero">
          <span className="kpi-label">Ahorros totales</span>
          <span className="kpi-value">{t.usd !== null ? formatUSD(Math.round(t.usd)) : '—'}</span>
          <span className="kpi-sub">
            {t.ars !== null
              ? `≈ ${formatARS(Math.round(t.ars))} al dólar MEP${fallbackMep ? ` de tu última carga (${formatARS(fallbackMep)})` : ''}`
              : 'Cargá la cotización del MEP para sumar pesos y dólares'}
            {monthDelta !== null && Math.abs(monthDelta) >= 0.005 && (
              <span className={`delta ${monthDelta > 0 ? 'down' : 'up'}`}>
                {' · '}
                <span aria-hidden>{monthDelta > 0 ? '▲' : '▼'}</span> {formatPct(Math.abs(monthDelta), 1)} vs. mes anterior (en USD)
              </span>
            )}
          </span>
        </div>
        <div className="kpi">
          <span className="kpi-label">En pesos</span>
          <span className="kpi-value sm">{formatARS(Math.round(t.arsAccounts))}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">En dólares</span>
          <span className="kpi-value sm">{formatUSD(Math.round(t.usdAccounts))}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Dólar MEP {mepSource === 'api' ? 'hoy' : mepSource === 'manual' ? '(manual)' : ''}</span>
          <RateEditor value={mep} onSave={onSaveManualMep} label="MEP manual" />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Cuentas</h2>
          {!adding && <button className="btn small" onClick={() => setAdding(true)}>+ Agregar cuenta</button>}
        </div>
        <p className="section-lead">
          Los brokers (Ecovalores, IOL, Balanz…) en general no ofrecen una forma pública de leer tu saldo desde otra app, así que lo actualizás a mano: con una vez por mes alcanza para ver la evolución. Si en el broker tenés pesos y dólares, cargá dos cuentas (ej. "Ecovalores ARS" y "Ecovalores USD").
        </p>

        {adding && (
          <AccountForm
            onCancel={accounts.length ? () => setAdding(false) : undefined}
            onSave={async (acc) => {
              const ok = await onSave([...accounts, { ...acc, history: acc.history.map((h) => ({ ...h, mep: acc.currency === 'ARS' ? effMep : null })) }])
              if (ok) setAdding(false)
            }}
          />
        )}

        {accounts.length > 0 && (
          <ul className="acc-list">
            {accounts.map((a) => {
              const l = latest(a)
              const p = previous(a)
              const k = kindOf(a.kind)
              const stale = l ? daysBetween(l.date, todayISO()) > 35 : false
              const diff = l && p && p.amount ? (l.amount - p.amount) / p.amount : null
              const usdValue = l && a.currency === 'ARS' ? toUSD(a, l, mep) : null
              return (
                <li key={a.id} className="acc-item">
                  <div className="acc-main">
                    <div className="acc-name">
                      <span aria-hidden>{k.emoji}</span>
                      <div>
                        <strong>{a.name}</strong>
                        <span className="card-meta">
                          {k.label} · {a.currency === 'USD' ? 'Dólares' : 'Pesos'}
                        </span>
                      </div>
                    </div>
                    <div className="acc-balance">
                      <span className="fig">{l ? money(a.currency, l.amount) : '—'}</span>
                      <span className="card-meta">
                        {l ? `al ${shortDate(l.date)}` : 'sin saldo'}
                        {diff !== null && Math.abs(diff) >= 0.0005 && (
                          <span className={diff > 0 ? 'pos' : 'neg'}>
                            {' · '}{diff > 0 ? '▲' : '▼'} {formatPct(Math.abs(diff), 1)}
                          </span>
                        )}
                      </span>
                      {usdValue !== null && <span className="card-meta">≈ {formatUSD(Math.round(usdValue))}</span>}
                    </div>
                  </div>
                  {stale && (
                    <p className="stale"><span aria-hidden>⏰</span> Hace más de un mes que no actualizás este saldo.</p>
                  )}
                  {updating === a.id ? (
                    <BalanceForm currency={a.currency} onCancel={() => setUpdating(null)} onSave={(amt, d) => addBalance(a, amt, d)} />
                  ) : (
                    <div className="card-actions">
                      <button className="btn small primary" onClick={() => setUpdating(a.id)}>Actualizar saldo</button>
                      {a.history.length > 0 && (
                        <button className="link" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
                          {open === a.id ? 'Ocultar historial' : `Historial (${a.history.length})`}
                        </button>
                      )}
                    </div>
                  )}
                  {open === a.id && (
                    <History
                      account={a}
                      onDeleteEntry={(date) => onSave(accounts.map((x) => (x.id === a.id ? { ...x, history: x.history.filter((h) => h.date !== date) } : x)))}
                      onDeleteAccount={() => onSave(accounts.filter((x) => x.id !== a.id))}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {hasHistory && <SavingsTrend series={series} />}
    </div>
  )
}

function SavingsTrend({ series }: { series: { month: string; usd: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const raw = Math.max(...series.map((s) => s.usd))
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const max = ([1, 2, 2.5, 5, 10].find((x) => x * mag >= raw) ?? 10) * mag
  return (
    <section className="card">
      <div className="card-head">
        <h2>Evolución en dólares</h2>
        <span className="muted small">Últimos 12 meses · saldo a fin de mes</span>
      </div>
      <div className="trend" onMouseLeave={() => setHover(null)}>
        <div className="trend-axis" aria-hidden>
          {[max, max / 2, 0].map((t) => <span key={t}>{t === 0 ? '0' : formatUSD(t)}</span>)}
        </div>
        <div className="trend-plot">
          {[max, max / 2, 0].map((t) => <i key={t} className="gridline" style={{ bottom: `${(t / max) * 100}%` }} aria-hidden />)}
          {series.map((p, i) => (
            <button
              key={p.month}
              className={`col savings ${i === series.length - 1 ? 'is-sel' : ''}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${monthLabel(p.month)}: ${formatUSD(Math.round(p.usd))}`}
            >
              <span className="col-bar" style={{ height: `${(p.usd / max) * 100}%` }} />
              {hover === i && (
                <span className="tooltip" role="tooltip">
                  <strong>{monthLabel(p.month)}</strong>
                  {formatUSD(Math.round(p.usd))}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="trend-labels" aria-hidden>
          {series.map((p, i) => (
            <span key={p.month} className={i === series.length - 1 ? 'is-sel' : ''}>{monthLabel(p.month, true)}</span>
          ))}
        </div>
      </div>
      <p className="footnote">Los saldos en pesos se pasan a dólares con el MEP del día en que los cargaste, así la inflación no infla la curva.</p>
    </section>
  )
}

function AccountForm({ onSave, onCancel }: { onSave: (a: SavingsAccount) => void; onCancel?: () => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SavingsKind>('broker')
  const [currency, setCurrency] = useState<Currency>('ARS')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const n = parseAmount(amount)
    if (!name.trim()) return setError('Ponele un nombre, por ejemplo "Ecovalores".')
    if (amount && (!Number.isFinite(n) || n < 0)) return setError('El saldo tiene que ser un número.')
    onSave({
      id: newId(),
      name: name.trim(),
      kind,
      currency,
      history: amount ? [{ date: todayISO(), amount: n }] : [],
    })
  }

  return (
    <form className="subform" onSubmit={submit} noValidate>
      <h3>Nueva cuenta</h3>
      <div className="row-2">
        <label className="field">
          <span className="field-label">Nombre</span>
          <input id="acc-name" placeholder="Ej: Ecovalores" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Tipo</span>
          <select id="acc-kind" value={kind} onChange={(e) => setKind(e.target.value as SavingsKind)}>
            {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
      </div>
      <div className="row-2">
        <label className="field">
          <span className="field-label">Moneda</span>
          <select id="acc-currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option value="ARS">Pesos</option>
            <option value="USD">Dólares</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Saldo de hoy <span className="optional">(opcional)</span></span>
          <input id="acc-amount" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="subform-actions">
        <button className="btn primary small" type="submit">Guardar cuenta</button>
        {onCancel && <button className="link" type="button" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  )
}

function BalanceForm({ currency, onSave, onCancel }: { currency: Currency; onSave: (n: number, date: string) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="balance-form"
      onSubmit={(e) => {
        e.preventDefault()
        const n = parseAmount(amount)
        if (!Number.isFinite(n) || n < 0) return setError('Poné el saldo total que ves en la cuenta.')
        if (!date) return setError('Falta la fecha.')
        onSave(n, date)
      }}
      noValidate
    >
      <label className="field">
        <span className="field-label">Saldo total ({currency === 'USD' ? 'USD' : '$'})</span>
        <input id="balance-amount" autoFocus inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Al día</span>
        <input id="balance-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="subform-actions">
        <button className="btn primary small" type="submit">Guardar</button>
        <button className="link" type="button" onClick={onCancel}>Cancelar</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  )
}

function History({
  account,
  onDeleteEntry,
  onDeleteAccount,
}: {
  account: SavingsAccount
  onDeleteEntry: (date: string) => void
  onDeleteAccount: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const rows = [...account.history].reverse()
  return (
    <div className="history">
      <table className="table compact">
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col" className="num">Saldo</th>
            <th scope="col" className="num">Cambio</th>
            <th scope="col"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => {
            const prev = rows[i + 1]
            const d = prev && prev.amount ? (h.amount - prev.amount) / prev.amount : null
            return (
              <tr key={h.date}>
                <td>{shortDate(h.date)}</td>
                <td className="num">{money(account.currency, h.amount)}</td>
                <td className={`num ${d === null ? '' : d >= 0 ? 'pos' : 'neg'}`}>
                  {d === null ? '—' : `${d >= 0 ? '+' : '−'}${formatPct(Math.abs(d), 1)}`}
                </td>
                <td className="actions">
                  <button className="icon-btn" onClick={() => onDeleteEntry(h.date)} aria-label={`Borrar saldo del ${shortDate(h.date)}`}>🗑</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="subform-actions">
        {confirm ? (
          <span className="confirm">
            ¿Borrar {account.name} y todo su historial?
            <button className="btn small danger" onClick={onDeleteAccount}>Sí, borrar</button>
            <button className="link" onClick={() => setConfirm(false)}>No</button>
          </span>
        ) : (
          <button className="link danger-text" onClick={() => setConfirm(true)}>Borrar cuenta</button>
        )}
      </div>
    </div>
  )
}
