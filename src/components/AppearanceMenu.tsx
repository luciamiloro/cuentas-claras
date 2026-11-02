import { useEffect, useRef, useState } from 'react'
import { applyMode, readMode, type Mode } from '../lib/appearance'

const MODES: { id: Mode; label: string }[] = [
  { id: 'system', label: 'Automático' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
]

/** Selector de modo claro / oscuro / automático (sigue al sistema). */
export function AppearanceMenu() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>(readMode)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="appearance" ref={ref}>
      <button
        className="icon-btn ring"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Modo claro u oscuro"
        title="Modo claro u oscuro"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="popover appearance-pop" role="dialog" aria-label="Modo claro u oscuro">
          <span className="pop-title">Modo</span>
          <div className="seg wide" role="radiogroup" aria-label="Modo claro u oscuro">
            {MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={mode === m.id}
                className={mode === m.id ? 'is-on' : ''}
                onClick={() => {
                  applyMode(m.id)
                  setMode(m.id)
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
