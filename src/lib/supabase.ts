import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
// Supabase la llama "publishable key" (nueva) o "anon key" (legacy): aceptamos las dos
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Cliente de Supabase, o `null` si no hay variables de entorno.
 * Sin Supabase la app funciona igual en modo local (útil para la demo).
 */
/** fetch con timeout: si la red se cuelga, mostramos un error en vez de "Cargando…" eterno. */
const fetchWithTimeout: typeof fetch = (input, init = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  init.signal?.addEventListener('abort', () => controller.abort())
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        global: { fetch: fetchWithTimeout },
      })
    : null

export const isCloudEnabled = supabase !== null
