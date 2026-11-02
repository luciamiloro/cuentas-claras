import { useMemo, useState } from 'react'
import App, { type Account } from './App'
import { LoginScreen } from './components/LoginScreen'
import { LocalStorageRepository } from './data/repository'
import { SupabaseRepository } from './data/supabaseRepository'
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabase'

const localRepo = new LocalStorageRepository()

/**
 * Decide con qué repositorio corre la app:
 *  - Sin Supabase configurado → modo local (demo).
 *  - Con sesión de Google → datos en la nube del usuario.
 *  - "Probar sin cuenta" → modo invitado en localStorage.
 */
export default function Root() {
  const { user, loading, error, signInWithGoogle, signOut } = useAuth()
  const [guest, setGuest] = useState(false)

  const cloudRepo = useMemo(
    () => (supabase && user ? new SupabaseRepository(supabase, user.id) : null),
    [user],
  )

  if (!supabase) return <App repo={localRepo} account={{ kind: 'local' }} />

  if (loading) {
    return (
      <div className="login">
        <p className="muted">Cargando…</p>
      </div>
    )
  }

  if (user && cloudRepo) {
    const meta = user.user_metadata as { full_name?: string; name?: string; avatar_url?: string }
    const account: Account = {
      kind: 'cloud',
      name: meta.full_name ?? meta.name ?? user.email ?? 'Mi cuenta',
      email: user.email ?? '',
      avatarUrl: meta.avatar_url,
      onSignOut: signOut,
      localRepo,
    }
    // key: si cambia el usuario, se remonta todo con estado limpio
    return <App key={user.id} repo={cloudRepo} account={account} />
  }

  if (guest) {
    return (
      <App
        repo={localRepo}
        account={{ kind: 'guest', onSignIn: () => { setGuest(false); signInWithGoogle() } }}
      />
    )
  }

  return <LoginScreen onGoogle={signInWithGoogle} onGuest={() => setGuest(true)} error={error} />
}
