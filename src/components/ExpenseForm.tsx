import { useRef, useState, type FormEvent } from 'react'
import type { Category, CreditCard, Currency, CustomCategory, Expense, MonthKey, NewExpense, PaymentMethod } from '../types'
import { PAYMENT_METHODS } from '../types'
import type { CategoryDraft, CategoryLookup } from '../lib/categories'
import { defaultDateFor } from '../lib/dates'
import { formatARS, formatUSD, parseAmount } from '../lib/format'
import { CategoryEditor } from './CategoryEditor'

interface Props {
  month: MonthKey
  editing: Expense | null
  /** Categorías para elegir (fábrica + propias activas) */
  categories: Category[]
  /** Resuelve cualquier id, archivadas incluidas */
  getCategory: CategoryLookup
  /** Propias (para validar duplicados al crear) */
  customCategories: CustomCategory[]
  /** Crea una categoría; devuelve la nueva o null si falló */
  onCreateCategory: (draft: CategoryDraft) => Promise<Category | null>
  cards: CreditCard[]
  /** Cotización sugerida para gastos en dólares (dólar tarjeta) */
  usdCardRate: number | null
  /** Devuelve false si no se pudo guardar (el form conserva lo cargado). */
  onSubmit: (input: NewExpense, id?: string) => Promise<boolean>
  onCancelEdit: () => void
  onSaved: (message: string) => void
  onAddCard: () => void
  /** Cerrar la hoja en el celu (en escritorio no se muestra) */
  onClose?: () => void
}

const toInput = (n: number) => String(n).replace('.', ',')

/**
 * El padre monta el form con `key={editing?.id ?? 'new'}`, así que el estado
 * inicial sale directo de las props (sin efectos para sincronizar).
 */
export function ExpenseForm({
  month,
  editing,
  categories,
  getCategory,
  customCategories,
  onCreateCategory,
  cards,
  usdCardRate,
  onSubmit,
  onCancelEdit,
  onSaved,
  onAddCard,
  onClose,
}: Props) {
  const editingUsd = editing?.currency === 'USD'
  const [currency, setCurrency] = useState<Currency>(editing?.currency ?? 'ARS')
  const [amount, setAmount] = useState(() =>
    editing ? toInput(editingUsd ? (editing.originalAmount ?? 0) : editing.amount) : '',
  )
  const [rate, setRate] = useState(() => {
    if (editingUsd && editing.originalAmount) return toInput(Math.round((editing.amount / editing.originalAmount) * 100) / 100)
    return usdCardRate ? toInput(usdCardRate) : ''
  })
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '')
  const [date, setDate] = useState(() => editing?.date ?? defaultDateFor(month))
  const [description, setDescription] = useState(editing?.description ?? '')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(editing?.paymentMethod ?? 'debito')
  const [cardId, setCardId] = useState(editing?.cardId ?? cards[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)

  // Si el gasto que se edita tiene una categoría archivada, la mostramos igual
  // para que la selección no quede invisible.
  // Si la elegida se borró mientras tanto, se descarta la selección.
  const isActive = categories.some((c) => c.id === categoryId)
  const isKnown =
    isActive || customCategories.some((c) => c.id === categoryId) || (!!editing && editing.categoryId === categoryId)
  const selectedId = isKnown ? categoryId : ''
  const archivedSelected = selectedId && !isActive ? getCategory(selectedId) : null

  async function createCategory(draft: CategoryDraft) {
    const created = await onCreateCategory(draft)
    if (!created) return false
    setCategoryId(created.id)
    setCreatingCategory(false)
    return true
  }

  // Si cambia el mes que se está mirando, la fecha sugerida lo acompaña
  // (patrón "ajustar estado durante el render", sin useEffect).
  const [prevMonth, setPrevMonth] = useState(month)
  if (month !== prevMonth) {
    setPrevMonth(month)
    if (!editing) setDate(defaultDateFor(month))
  }
  // Cuando llega la cotización (API) y el campo está vacío, la sugerimos
  const [prevRate, setPrevRate] = useState(usdCardRate)
  if (usdCardRate !== prevRate) {
    setPrevRate(usdCardRate)
    if (!rate && usdCardRate) setRate(toInput(usdCardRate))
  }

  const parsed = parseAmount(amount)
  const parsedRate = parseAmount(rate)
  const isUsd = currency === 'USD'
  const arsAmount = isUsd ? parsed * parsedRate : parsed
  const validCard = cards.some((c) => c.id === cardId) ? cardId : (cards[0]?.id ?? '')

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!Number.isFinite(parsed) || parsed <= 0) return setError('Poné un monto mayor a cero.')
    if (isUsd && (!Number.isFinite(parsedRate) || parsedRate <= 0)) return setError('Poné la cotización del dólar para pasarlo a pesos.')
    if (!selectedId) return setError('Elegí una categoría.')
    if (!date) return setError('Falta la fecha.')
    setError(null)
    setSaving(true)
    const ok = await onSubmit(
      {
        amount: Math.round(arsAmount * 100) / 100,
        currency,
        originalAmount: isUsd ? Math.round(parsed * 100) / 100 : null,
        cardId: paymentMethod === 'credito' && validCard ? validCard : null,
        categoryId: selectedId,
        date,
        description: description.trim(),
        paymentMethod,
      },
      editing?.id,
    )
    setSaving(false)
    if (!ok) return setError('No se pudo guardar. Revisá tu conexión y probá de nuevo.')
    onSaved(editing ? 'Gasto actualizado' : `Cargado: ${isUsd ? formatUSD(parsed) : formatARS(parsed)}`)
    if (editing) return onCancelEdit()
    setAmount('')
    setDescription('')
    amountRef.current?.focus()
  }

  return (
    <form className="card form" onSubmit={handleSubmit} noValidate>
      <div className="card-head">
        <h2>{editing ? 'Editar gasto' : 'Nuevo gasto'}</h2>
        {editing ? (
          <button type="button" className="link" onClick={onCancelEdit}>
            Cancelar
          </button>
        ) : (
          onClose && (
            <button type="button" className="icon-btn sheet-close" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          )
        )}
      </div>

      <div className="field amount-field">
        <div className="amount-head">
          <label className="field-label" htmlFor="expense-amount">Monto</label>
          <div className="seg" role="radiogroup" aria-label="Moneda">
            {(['ARS', 'USD'] as const).map((c) => (
              <button
                type="button"
                key={c}
                role="radio"
                aria-checked={currency === c}
                className={currency === c ? 'is-on' : ''}
                onClick={() => setCurrency(c)}
              >
                {c === 'ARS' ? 'Pesos' : 'Dólares'}
              </button>
            ))}
          </div>
        </div>
        <div className="amount-input">
          <span aria-hidden>{isUsd ? 'US$' : '$'}</span>
          <input
            id="expense-amount"
            ref={amountRef}
            autoFocus={!!editing}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        {isUsd ? (
          <div className="rate-row">
            <label htmlFor="expense-rate">Dólar tarjeta $</label>
            <input
              id="expense-rate"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="Cotización"
            />
            <span className="hint">
              {Number.isFinite(arsAmount) && arsAmount > 0 ? `≈ ${formatARS(Math.round(arsAmount))}` : ''}
            </span>
          </div>
        ) : (
          Number.isFinite(parsed) && parsed > 0 && <span className="hint">{formatARS(parsed)}</span>
        )}
      </div>

      <fieldset className="field">
        <legend className="field-label">Categoría</legend>
        <div className="chips" role="radiogroup">
          {categories.map((c) => (
            <button
              type="button"
              key={c.id}
              role="radio"
              aria-checked={selectedId === c.id}
              className={`chip ${selectedId === c.id ? 'is-on' : ''}`}
              onClick={() => setCategoryId(c.id)}
            >
              <span aria-hidden>{c.emoji}</span> {c.name}
            </button>
          ))}
          {archivedSelected && (
            <button type="button" role="radio" aria-checked className="chip is-on">
              <span aria-hidden>{archivedSelected.emoji}</span> {archivedSelected.name}{' '}
              <span className="chip-note">(archivada)</span>
            </button>
          )}
          {!creatingCategory && (
            <button
              type="button"
              className="chip chip-add"
              onClick={() => setCreatingCategory(true)}
              aria-label="Nueva categoría"
            >
              + Nueva
            </button>
          )}
        </div>
        {creatingCategory && (
          <CategoryEditor
            existing={customCategories}
            title="Nueva categoría"
            saveLabel="Crear y elegir"
            onSave={createCategory}
            onCancel={() => setCreatingCategory(false)}
          />
        )}
      </fieldset>

      <div className="row-2">
        <label className="field">
          <span className="field-label">Fecha</span>
          <input id="expense-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Medio de pago</span>
          <select id="expense-method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {paymentMethod === 'credito' &&
        (cards.length ? (
          <label className="field">
            <span className="field-label">Tarjeta</span>
            <select id="expense-card" value={validCard} onChange={(e) => setCardId(e.target.value)}>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="hint">
            Para que te avise antes del vencimiento,{' '}
            <button type="button" className="link" onClick={onAddCard}>
              agregá tu tarjeta
            </button>
            .
          </p>
        ))}

      <label className="field">
        <span className="field-label">
          Descripción <span className="optional">(opcional)</span>
        </span>
        <input
          id="expense-description"
          placeholder={isUsd ? 'Ej: Spotify, compra online' : 'Ej: súper del finde'}
          maxLength={80}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button className="btn primary" type="submit" disabled={saving}>
        {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar gasto'}
      </button>
    </form>
  )
}
