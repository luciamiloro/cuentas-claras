import { useId, useState, type KeyboardEvent } from 'react'
import type { CategoryKind, CustomCategory } from '../types'
import {
  DEFAULT_CUSTOM_EMOJI,
  EMOJI_SUGGESTIONS,
  MAX_CATEGORY_NAME,
  cleanName,
  firstGrapheme,
  lastGrapheme,
  validateCategory,
  type CategoryDraft,
} from '../lib/categories'

interface Props {
  /** Si viene, se edita esa categoría */
  initial?: CustomCategory | null
  /** Categorías propias existentes (para validar duplicados) */
  existing: CustomCategory[]
  /** Devuelve false si no se pudo guardar */
  onSave: (draft: CategoryDraft) => Promise<boolean>
  onCancel: () => void
  title: string
  saveLabel: string
  autoFocus?: boolean
}

/**
 * Editor de categoría. Es un <div> (no un <form>) a propósito: se usa dentro
 * del formulario del gasto y los forms no se pueden anidar. Enter confirma
 * sin disparar el submit del gasto.
 */
export function CategoryEditor({ initial, existing, onSave, onCancel, title, saveLabel, autoFocus = true }: Props) {
  const uid = useId()
  const [emoji, setEmoji] = useState(initial?.emoji ?? DEFAULT_CUSTOM_EMOJI)
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<CategoryKind>(initial?.kind ?? 'variable')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving) return
    const draft: CategoryDraft = { name: cleanName(name), emoji: firstGrapheme(emoji), kind }
    const problem = validateCategory({ ...draft, name }, existing, initial?.id)
    if (problem) return setError(problem)
    setError(null)
    setSaving(true)
    const ok = await onSave(draft)
    setSaving(false)
    if (!ok) setError('No se pudo guardar. Probá de nuevo.')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault() // que no se envíe el form del gasto
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation() // que no cierre la hoja en el celu
      onCancel()
    }
  }

  return (
    <div className="subform cat-editor" role="group" aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`}>{title}</h3>

      <div className="cat-editor-row">
        <label className="field emoji-field">
          <span className="field-label">Emoji</span>
          <input
            id={`${uid}-emoji`}
            className="emoji-input"
            value={emoji}
            autoComplete="off"
            onChange={(e) => setEmoji(lastGrapheme(e.target.value))}
            onKeyDown={onKeyDown}
            aria-describedby={`${uid}-picks`}
          />
        </label>
        <label className="field cat-name-field">
          <span className="field-label">
            Nombre <span className="count">{name.length}/{MAX_CATEGORY_NAME}</span>
          </span>
          <input
            id={`${uid}-name`}
            placeholder="Ej: Gimnasio"
            maxLength={MAX_CATEGORY_NAME}
            autoComplete="off"
            autoFocus={autoFocus}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={onKeyDown}
          />
        </label>
      </div>

      <div className="emoji-picks" id={`${uid}-picks`} role="group" aria-label="Emojis sugeridos">
        {EMOJI_SUGGESTIONS.map((em) => (
          <button
            type="button"
            key={em}
            className={emoji === em ? 'is-on' : ''}
            aria-pressed={emoji === em}
            aria-label={`Usar ${em}`}
            onClick={() => setEmoji(em)}
          >
            {em}
          </button>
        ))}
      </div>

      <div className="cat-kind">
        <span className="field-label" id={`${uid}-kind`}>Tipo</span>
        <div className="seg" role="radiogroup" aria-labelledby={`${uid}-kind`}>
          {(['fijo', 'variable'] as const).map((k) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={kind === k}
              className={kind === k ? 'is-on' : ''}
              onClick={() => setKind(k)}
            >
              {k === 'fijo' ? 'Fijo' : 'Variable'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="subform-actions">
        <button type="button" className="btn primary small" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : saveLabel}
        </button>
        <button type="button" className="link" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
