import type { Category, CategoryKind, CustomCategory } from '../types'

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

export const FACTORY_IDS = new Set(CATEGORIES.map((c) => c.id))

const byId = new Map(CATEGORIES.map((c) => [c.id, c]))

const unknown = (id: string): Category => ({ id, name: id, emoji: '❔', kind: 'variable' })

/** Sólo categorías de fábrica. Para incluir las propias, usá `buildCatalog(...).get`. */
export function getCategory(id: string): Category {
  return byId.get(id) ?? unknown(id)
}

export type CategoryLookup = (id: string) => Category

export const MAX_CATEGORY_NAME = 30
export const DEFAULT_CUSTOM_EMOJI = '🏷️'
export const EMOJI_SUGGESTIONS = ['🏷️', '🏋️', '🎮', '💇', '🍺', '🎓', '🧒', '🚲', '💻', '🌱', '⚽', '🎨']

export interface CategoryCatalog {
  /** Para elegir al cargar: fábrica + propias no archivadas */
  active: Category[]
  /** Fábrica + todas las propias (archivadas incluidas), para exportar */
  all: Category[]
  /** Resuelve cualquier id, archivadas incluidas: los gastos viejos conservan nombre y emoji */
  get: CategoryLookup
}

const strip = ({ id, name, emoji, kind }: Category): Category => ({ id, name, emoji, kind })

export function buildCatalog(custom: CustomCategory[]): CategoryCatalog {
  const map = new Map<string, Category>(byId)
  for (const c of custom) map.set(c.id, strip(c))
  return {
    active: [...CATEGORIES, ...custom.filter((c) => !c.archived).map(strip)],
    all: [...CATEGORIES, ...custom.map(strip)],
    get: (id) => map.get(id) ?? unknown(id),
  }
}

/** Suma las categorías entrantes cuyo id todavía no existe (importar backup, subir lo local a la nube). */
export function mergeCategories(prev: CustomCategory[], incoming: CustomCategory[]): CustomCategory[] {
  const ids = new Set(prev.map((c) => c.id))
  return [...prev, ...incoming.filter((c) => !ids.has(c.id))]
}

/** Saca espacios de más y corta al largo máximo. */
export const cleanName = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, MAX_CATEGORY_NAME)

/** Caracteres visibles (un emoji compuesto cuenta como uno). */
export function graphemes(s: string): string[] {
  const t = s.trim()
  if (!t) return []
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(t), (x) => x.segment)
  }
  return Array.from(t)
}

export const firstGrapheme = (s: string) => graphemes(s)[0] ?? ''
export const lastGrapheme = (s: string) => graphemes(s).at(-1) ?? ''

const key = (s: string) => cleanName(s).toLocaleLowerCase('es')

export interface CategoryDraft {
  name: string
  emoji: string
  kind: CategoryKind
}

/** Devuelve un mensaje de error, o null si la categoría es válida. */
export function validateCategory(draft: CategoryDraft, custom: CustomCategory[], exceptId?: string): string | null {
  const trimmed = draft.name.trim().replace(/\s+/g, ' ')
  if (!trimmed) return 'Ponele un nombre.'
  if (trimmed.length > MAX_CATEGORY_NAME) return `El nombre puede tener hasta ${MAX_CATEGORY_NAME} caracteres.`
  if (!firstGrapheme(draft.emoji)) return 'Elegí un emoji.'
  const k = key(trimmed)
  if (CATEGORIES.some((c) => key(c.name) === k)) return 'Ya existe una categoría con ese nombre.'
  const clash = custom.find((c) => c.id !== exceptId && key(c.name) === k)
  if (clash?.archived) return 'Ya tenés una categoría archivada con ese nombre; reactivala desde "Tus categorías".'
  if (clash) return 'Ya tenés una categoría con ese nombre.'
  return null
}
