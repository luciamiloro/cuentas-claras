/** Modo claro/oscuro por dispositivo. Se guarda en el navegador sólo cuando la persona lo elige. */
export type Mode = 'system' | 'light' | 'dark'

const KEY = 'cuentas-claras:mode:v1'

export function readMode(): Mode {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw === 'light' || raw === 'dark' ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function applyMode(mode: Mode, persist = true) {
  const root = document.documentElement
  if (mode === 'system') delete root.dataset.theme
  else root.dataset.theme = mode
  if (!persist) return
  try {
    window.localStorage.setItem(KEY, mode)
  } catch {
    /* sin storage: vale sólo para esta sesión */
  }
}
