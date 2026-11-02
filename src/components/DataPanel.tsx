import { useRef, useState } from 'react'
import type { Expense } from '../types'
import { CATEGORIES } from '../lib/categories'
import { categoriesToCsv, downloadText, expensesToCsv } from '../lib/csv'
import { isExpense } from '../data/repository'
import { todayISO } from '../lib/dates'

interface Props {
  expenses: Expense[]
  onReplaceAll: (list: Expense[]) => Promise<void>
  onLoadDemo?: () => void
  storageLabel: string
}

export function DataPanel({ expenses, onReplaceAll, onLoadDemo, storageLabel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)

  const say = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 3500)
  }

  function exportPowerBI() {
    downloadText('gastos.csv', expensesToCsv(expenses))
    setTimeout(() => downloadText('categorias.csv', categoriesToCsv(CATEGORIES)), 300)
    say('Descargados gastos.csv y categorias.csv — ponelos en la carpeta que lee Power BI.')
  }

  function exportBackup() {
    downloadText(`cuentas-claras-backup-${todayISO()}.json`, JSON.stringify({ version: 1, expenses }, null, 2), 'application/json')
  }

  async function importBackup(file: File) {
    try {
      const data = JSON.parse(await file.text())
      const list = Array.isArray(data) ? data : data?.expenses
      if (!Array.isArray(list)) throw new Error()
      const valid = list.filter(isExpense)
      await onReplaceAll(valid)
      say(`Importados ${valid.length} gastos${valid.length < list.length ? ` (${list.length - valid.length} filas inválidas ignoradas)` : ''}.`)
    } catch {
      say('No se pudo importar: el archivo no es un backup válido o falló la conexión.')
    }
  }

  return (
    <section className="card data-panel">
      <div className="card-head">
        <h2>Datos</h2>
        <span className="muted small">{storageLabel}</span>
      </div>
      <div className="data-actions">
        <button className="btn" onClick={exportPowerBI} disabled={!expenses.length}>
          Exportar para Power BI (CSV)
        </button>
        <button className="btn" onClick={exportBackup} disabled={!expenses.length}>
          Descargar backup
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Importar backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importBackup(f)
            e.target.value = ''
          }}
        />
        {onLoadDemo && (
          <button className="btn ghost" onClick={onLoadDemo}>
            Cargar datos de ejemplo
          </button>
        )}
        {confirmWipe ? (
          <span className="confirm">
            ¿Seguro? Se borra todo.
            <button className="btn small danger" onClick={() => { onReplaceAll([]).catch(() => say('No se pudo borrar. Probá de nuevo.')); setConfirmWipe(false) }}>Sí, borrar</button>
            <button className="link" onClick={() => setConfirmWipe(false)}>No</button>
          </span>
        ) : (
          <button className="btn ghost danger-text" onClick={() => setConfirmWipe(true)} disabled={!expenses.length}>
            Borrar todo
          </button>
        )}
      </div>
      <p className="flash" aria-live="polite">{msg}</p>
    </section>
  )
}
