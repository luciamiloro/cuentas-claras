import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(supabase !== null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.auth.getSession().then(({ data, error: err }) => {
      if (!alive) return
      if (err) setError(err.message)
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setLoading(false)
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return
    setError(null)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Vuelve a la misma URL (localhost en desarrollo, Vercel en producción)
      options: { redirectTo: window.location.origin + window.location.pathname },
    })
    if (err) setError(err.message)
  }, [])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
  }, [])

  return { session, user: session?.user ?? null, loading, error, signInWithGoogle, signOut }
}
