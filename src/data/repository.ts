import type { Expense, NewExpense, Settings } from '../types'
import { newId, normalizeSettings } from '../lib/settings'

/**
 * Capa de datos. La UI sólo conoce esta interfaz, así que pasar de
 * localStorage a Supabase (u otra API) es implementar otra clase con
 * los mismos métodos — ver supabaseRepository.ts.
 */
export interface ExpenseRepository {
  list(): Promise<Expense[]>
  add(input: NewExpense): Promise<Expense>
  update(id: string, input: NewExpense): Promise<Expense>
  remove(id: string): Promise<void>
  replaceAll(expenses: Expense[]): Promise<void>
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>
}

const EXPENSES_KEY = 'cuentas-claras:expenses:v1'
const SETTINGS_KEY = 'cuentas-claras:settings:v1'

/** localStorage puede no estar disponible (modo privado, iframes); caemos a memoria. */
class SafeStorage {
  private memory = new Map<string, string>()
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return this.memory.get(key) ?? null
    }
  }
  set(key: string, value: string) {
    this.memory.set(key, value)
    try {
      window.localStorage.setItem(key, value)
    } catch {
      /* sin persistencia, queda en memoria */
    }
  }
}

export class LocalStorageRepository implements ExpenseRepository {
  private storage = new SafeStorage()

  private read(): Expense[] {
    const raw = this.storage.get(EXPENSES_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(isExpense) : []
    } catch {
      return []
    }
  }

  private write(expenses: Expense[]) {
    this.storage.set(EXPENSES_KEY, JSON.stringify(expenses))
  }

  async list() {
    return this.read()
  }

  async add(input: NewExpense) {
    const expense: Expense = { ...input, id: newId(), createdAt: new Date().toISOString() }
    this.write([...this.read(), expense])
    return expense
  }

  async update(id: string, input: NewExpense) {
    const all = this.read()
    const prev = all.find((e) => e.id === id)
    if (!prev) throw new Error(`No existe el gasto ${id}`)
    const updated: Expense = { ...prev, ...input }
    this.write(all.map((e) => (e.id === id ? updated : e)))
    return updated
  }

  async remove(id: string) {
    this.write(this.read().filter((e) => e.id !== id))
  }

  async replaceAll(expenses: Expense[]) {
    this.write(expenses.filter(isExpense))
  }

  async getSettings(): Promise<Settings> {
    const raw = this.storage.get(SETTINGS_KEY)
    try {
      return normalizeSettings(raw ? JSON.parse(raw) : null)
    } catch {
      return normalizeSettings(null)
    }
  }

  async saveSettings(settings: Settings) {
    this.storage.set(SETTINGS_KEY, JSON.stringify(settings))
  }
}

export function isExpense(x: unknown): x is Expense {
  if (!x || typeof x !== 'object') return false
  const e = x as Record<string, unknown>
  return (
    typeof e.id === 'string' &&
    typeof e.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
    typeof e.amount === 'number' &&
    Number.isFinite(e.amount) &&
    typeof e.categoryId === 'string' &&
    typeof e.description === 'string' &&
    typeof e.paymentMethod === 'string'
  )
}
