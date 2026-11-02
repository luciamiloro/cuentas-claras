import type { Category } from '../types'

export const CATEGORIES: Category[] = [
  { id: 'vivienda', name: 'Vivienda', emoji: '🏠', kind: 'fijo' },
  { id: 'servicios', name: 'Servicios', emoji: '💡', kind: 'fijo' },
  { id: 'suscripciones', name: 'Suscripciones', emoji: '📺', kind: 'fijo' },
  { id: 'educacion', name: 'Educación', emoji: '📚', kind: 'fijo' },
  { id: 'supermercado', name: 'Supermercado', emoji: '🛒', kind: 'variable' },
  { id: 'comida-afuera', name: 'Comida afuera', emoji: '🍕', kind: 'variable' },
  { id: 'transporte', name: 'Transporte', emoji: '🚗', kind: 'variable' },
  { id: 'salud', name: 'Salud', emoji: '💊', kind: 'variable' },
  { id: 'ocio', name: 'Ocio', emoji: '🎬', kind: 'variable' },
  { id: 'ropa', name: 'Ropa', emoji: '👕', kind: 'variable' },
  { id: 'hogar', name: 'Hogar', emoji: '🛋️', kind: 'variable' },
  { id: 'mascotas', name: 'Mascotas', emoji: '🐾', kind: 'variable' },
  { id: 'regalos', name: 'Regalos', emoji: '🎁', kind: 'variable' },
  { id: 'viajes', name: 'Viajes', emoji: '✈️', kind: 'variable' },
  { id: 'otros', name: 'Otros', emoji: '📦', kind: 'variable' },
]

const byId = new Map(CATEGORIES.map((c) => [c.id, c]))

export function getCategory(id: string): Category {
  return byId.get(id) ?? { id, name: id, emoji: '❔', kind: 'variable' }
}
