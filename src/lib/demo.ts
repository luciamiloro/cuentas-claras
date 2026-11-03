import type { Expense, MonthKey, PaymentMethod, Settings } from '../types'
import { daysInMonth, monthRange, shiftMonth } from './dates'

export const DEMO_CARD_ID = 'demo-card-visa'

/** PRNG determinístico para que los datos de ejemplo sean siempre iguales. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Template {
  categoryId: string
  description: string[]
  /** monto base en ARS del primer mes */
  base: number
  /** veces por mes [min, max] */
  times: [number, number]
  method: PaymentMethod[]
  fixedDay?: number
}

const TEMPLATES: Template[] = [
  { categoryId: 'vivienda', description: ['Alquiler'], base: 420000, times: [1, 1], method: ['transferencia'], fixedDay: 5 },
  { categoryId: 'vivienda', description: ['Expensas'], base: 65000, times: [1, 1], method: ['transferencia'], fixedDay: 10 },
  { categoryId: 'servicios', description: ['Luz', 'Gas', 'Internet', 'Celular'], base: 28000, times: [4, 4], method: ['debito'], fixedDay: 12 },
  { categoryId: 'suscripciones', description: ['Netflix', 'Spotify', 'iCloud', 'Disney+'], base: 9000, times: [3, 4], method: ['credito'], fixedDay: 3 },
  { categoryId: 'educacion', description: ['Curso online', 'Libros técnicos'], base: 45000, times: [0, 1], method: ['credito'] },
  { categoryId: 'supermercado', description: ['La Anónima', 'Supermercado', 'Verdulería', 'Carnicería', 'Almacén'], base: 38000, times: [7, 10], method: ['debito', 'debito', 'credito', 'efectivo'] },
  { categoryId: 'comida-afuera', description: ['Delivery', 'Café', 'Cena afuera', 'Pizzería', 'Almuerzo'], base: 18000, times: [4, 8], method: ['credito', 'debito', 'efectivo'] },
  { categoryId: 'transporte', description: ['Nafta', 'Remis', 'Estacionamiento'], base: 32000, times: [2, 4], method: ['debito', 'efectivo'] },
  { categoryId: 'salud', description: ['Farmacia', 'Consulta', 'Prepaga copago'], base: 22000, times: [0, 2], method: ['debito'] },
  { categoryId: 'ocio', description: ['Cine', 'Salida', 'Juego', 'Recital'], base: 20000, times: [1, 3], method: ['credito', 'efectivo'] },
  { categoryId: 'ropa', description: ['Zapatillas', 'Campera', 'Ropa'], base: 55000, times: [0, 2], method: ['credito'] },
  { categoryId: 'hogar', description: ['Ferretería', 'Bazar', 'Limpieza'], base: 15000, times: [0, 2], method: ['debito', 'efectivo'] },
  { categoryId: 'mascotas', description: ['Alimento', 'Veterinaria'], base: 30000, times: [1, 2], method: ['debito'] },
  { categoryId: 'regalos', description: ['Cumpleaños', 'Regalo'], base: 25000, times: [0, 1], method: ['credito'] },
]

/**
 * Genera `months` meses de gastos realistas que terminan en `end`.
 * Aplica ~2,5% de inflación mensual para que la tendencia tenga sentido.
 * Si se pasa `today` (YYYY-MM-DD), descarta gastos posteriores a esa fecha.
 */
export function generateDemoExpenses(end: MonthKey, months = 6, seed = 42, today?: string): Expense[] {
  const rand = mulberry32(seed)
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const out: Expense[] = []
  let n = 0

  monthRange(end, months).forEach((month, mi) => {
    const inflation = Math.pow(1.025, mi)
    const days = daysInMonth(month)
    for (const t of TEMPLATES) {
      const times = t.times[0] + Math.floor(rand() * (t.times[1] - t.times[0] + 1))
      for (let i = 0; i < times; i++) {
        const day = t.fixedDay ? Math.min(t.fixedDay + i, days) : 1 + Math.floor(rand() * days)
        const noise = t.fixedDay ? 0.92 + rand() * 0.16 : 0.5 + rand()
        const amount = Math.round((t.base * inflation * noise) / 50) * 50
        const description = t.categoryId === 'servicios' || t.categoryId === 'suscripciones'
          ? t.description[i % t.description.length]
          : pick(t.description)
        const date = `${month}-${String(day).padStart(2, '0')}`
        // Las suscripciones se pagan en dólares con la tarjeta
        const usd = t.categoryId === 'suscripciones'
        const usdAmount = usd ? Math.round((3 + rand() * 9) * 100) / 100 : null
        const method = usd ? 'credito' : pick(t.method)
        out.push({
          ...(usd ? { currency: 'USD' as const, originalAmount: usdAmount } : {}),
          ...(method === 'credito' ? { cardId: DEMO_CARD_ID } : {}),
          // La ropa en cuotas, para que se vea lo comprometido en próximos resúmenes
          ...(t.categoryId === 'ropa' ? { installments: 3 } : {}),
          id: `demo-${String(++n).padStart(4, '0')}`,
          date,
          amount: usd ? Math.round((usdAmount ?? 0) * 1450 * inflation) : amount,
          categoryId: t.categoryId,
          description,
          paymentMethod: method,
          createdAt: `${date}T12:00:00.000Z`,
        })
      }
    }
    // Un viaje en el anteúltimo mes para que haya un pico interesante
    if (mi === months - 3) {
      out.push({
        id: `demo-${String(++n).padStart(4, '0')}`,
        date: `${month}-18`,
        amount: Math.round(380000 * inflation),
        categoryId: 'viajes',
        description: 'Escapada de fin de semana',
        paymentMethod: 'credito',
        cardId: DEMO_CARD_ID,
        installments: 6,
        createdAt: `${month}-18T12:00:00.000Z`,
      })
    }
  })
  // Nada en el futuro: si el último mes es el actual, cortamos en `today`
  return today ? out.filter((e) => e.date <= today) : out
}

/** Tarjeta y ahorros de ejemplo para mostrar las otras secciones. */
export function generateDemoSettings(end: MonthKey, base: Settings): Settings {
  const months = monthRange(shiftMonth(end, -1), 6)
  const eco = months.map((m, i) => ({ date: `${m}-28`, amount: Math.round(2_400_000 * Math.pow(1.045, i)), mep: Math.round(1180 * Math.pow(1.02, i)) }))
  const usd = months.map((m, i) => ({ date: `${m}-28`, amount: 1500 + i * 120 }))
  return {
    ...base,
    cards: [{ id: DEMO_CARD_ID, name: 'Visa (ejemplo)', closingDay: 25, dueDay: 5, autoDebit: true, remindDaysBefore: 5 }],
    savings: [
      { id: 'demo-acc-eco-ars', name: 'Broker ARS (ejemplo)', kind: 'broker', currency: 'ARS', history: eco },
      { id: 'demo-acc-eco-usd', name: 'Broker USD (ejemplo)', kind: 'broker', currency: 'USD', history: usd },
    ],
  }
}
