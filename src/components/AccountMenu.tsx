import { useEffect, useRef, useState } from 'react'
import type { Account } from '../App'

export function AccountMenu({ account }: { account: Account }) {
  const [open, setOpen] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
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

  if (account.kind !== 'cloud') return null
  const initial = account.name.trim()[0]?.toUpperCase() ?? '?'

  return (
    <div className="account" ref={ref}>
      <button
        className="avatar-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Cuenta de ${account.name}`}
      >
        {account.avatarUrl && !imgFailed ? (
          <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
        ) : (
          <span aria-hidden>{initial}</span>
        )}
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-who">
            <strong>{account.name}</strong>
            <span>{account.email}</span>
          </div>
          <p className="account-note">☁ Tus gastos se sincronizan en todos tus dispositivos.</p>
          <button className="btn small" role="menuitem" onClick={account.onSignOut}>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
