import { useMemo, useState } from 'react'
import type { CustomCategory, Expense } from '../types'
import type { CategoryDraft } from '../lib/categories'
import { CategoryEditor } from './CategoryEditor'

interface Props {
  categories: CustomCategory[]
  /** Todos los gastos (de todos los meses), para saber si una categoría está en uso */
  expenses: Expense[]
  onCreate: (draft: CategoryDraft) => Promise<boolean>
  onUpdate: (id: string, draft: CategoryDraft) => Promise<boolean>
  /** Archiva si tiene gastos; si no, la borra */
  onRemove: (id: string) => void
  onRestore: (id: string) => void
}

const kindLabel = (k: CustomCategory['kind']) => (k === 'fijo' ? 'Fijo' : 'Variable')
const countLabel = (n: number) => (n === 0 ? 'Sin gastos' : `${n} ${n === 1 ? 'gasto' : 'gastos'}`)

export function CategoriesManager({ categories, expenses, onCreate, onUpdate, onRemove, onRestore }: Props) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const usage = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of expenses) m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + 1)
    return m
  }, [expenses])

  const active = categories.filter((c) => !c.archived)
  const archived = categories.filter((c) => c.archived)

  return (
    <section className="card categories-manager">
      <div className="card-head">
        <h2>Tus categorías</h2>
        {editing !== 'new' && (
          <button className="btn small" onClick={() => setEditing('new')}>
            + Nueva categoría
          </button>
        )}
      </div>

      {editing === 'new' && (
        <CategoryEditor
          existing={categories}
          title="Nueva categoría"
          saveLabel="Crear categoría"
          onSave={async (d) => {
            const ok = await onCreate(d)
            if (ok) setEditing(null)
            return ok
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {active.length === 0 && editing !== 'new' ? (
        <p className="section-lead">
          Además de las de siempre, podés crear las tuyas (por ejemplo "Gimnasio" o "Hijos"). También desde el formulario de
          gasto, con el chip <strong>+ Nueva</strong>.
        </p>
      ) : (
        <ul className="cat-list">
          {active.map((c) => {
            const n = usage.get(c.id) ?? 0
            return editing === c.id ? (
              <li key={c.id}>
                <CategoryEditor
                  initial={c}
                  existing={categories}
                  title={`Editar ${c.name}`}
                  saveLabel="Guardar"
                  onSave={async (d) => {
                    const ok = await onUpdate(c.id, d)
                    if (ok) setEditing(null)
                    return ok
                  }}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={c.id} className="cat-row">
                <span className="cat-emoji" aria-hidden>{c.emoji}</span>
                <span className="cat-info">
                  <strong>{c.name}</strong>
                  <span className="cat-meta">
                    {kindLabel(c.kind)} · {countLabel(n)}
                  </span>
                </span>
                <span className="cat-actions">
                  <button className="link" onClick={() => setEditing(c.id)} aria-label={`Editar ${c.name}`}>
                    Editar
                  </button>
                  <button
                    className="link danger-text"
                    onClick={() => onRemove(c.id)}
                    aria-label={`${n > 0 ? 'Archivar' : 'Borrar'} ${c.name}`}
                    title={n > 0 ? 'Deja de aparecer al cargar; los gastos viejos la conservan' : undefined}
                  >
                    {n > 0 ? 'Archivar' : 'Borrar'}
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="cat-archived">
          <button className="link" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
            {showArchived ? 'Ocultar archivadas' : `Ver archivadas (${archived.length})`}
          </button>
          {showArchived && (
            <ul className="cat-list">
              {archived.map((c) => (
                <li key={c.id} className="cat-row is-archived">
                  <span className="cat-emoji" aria-hidden>{c.emoji}</span>
                  <span className="cat-info">
                    <strong>{c.name}</strong>
                    <span className="cat-meta">
                      {kindLabel(c.kind)} · {countLabel(usage.get(c.id) ?? 0)}
                    </span>
                  </span>
                  <span className="cat-actions">
                    <button className="link" onClick={() => onRestore(c.id)} aria-label={`Reactivar ${c.name}`}>
                      Reactivar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
