/**
 * Cotizaciones desde DolarApi (https://dolarapi.com), API pública y gratuita.
 * Si falla (sin conexión, API caída) la app sigue con la cotización cargada a mano.
 */
export type RateKind = 'tarjeta' | 'bolsa' // bolsa = dólar MEP

export interface Rate {
  venta: number
  fecha: string
}

export async function fetchRate(kind: RateKind): Promise<Rate | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(`https://dolarapi.com/v1/dolares/${kind}`, { signal: controller.signal })
    if (!res.ok) return null
    const data = (await res.json()) as { venta?: unknown; fechaActualizacion?: unknown }
    const venta = Number(data.venta)
    if (!Number.isFinite(venta) || venta <= 0) return null
    return { venta, fecha: typeof data.fechaActualizacion === 'string' ? data.fechaActualizacion : '' }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
