import type { SupabaseClient } from '@supabase/supabase-js'
import type { Currency, Expense, NewExpense, PaymentMethod, Settings } from '../types'
import { newId, normalizeSettings } from '../lib/settings'
import type { ExpenseRepository } from './repository'

interface ExpenseRow {
  id: string
  user_id: string
  date: string
  amount: number | string // numeric llega como string desde PostgREST
  category_id: string
  description: string
  payment_method: PaymentMethod
  created_at: string
  currency: Currency
  original_amount: number | string | null
  card_id: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const toRow = (e: NewExpense) => ({
  date: e.date,
  amount: e.amount,
  category_id: e.categoryId,
  description: e.description,
  payment_method: e.paymentMethod,
  currency: e.currency ?? 'ARS',
  original_amount: e.currency === 'USD' ? (e.originalAmount ?? null) : null,
  card_id: e.paymentMethod === 'credito' ? (e.cardId ?? null) : null,
})

const fromRow = (r: ExpenseRow): Expense => ({
  id: r.id,
  date: r.date,
  amount: Number(r.amount),
  categoryId: r.category_id,
  description: r.description,
  paymentMethod: r.payment_method,
  createdAt: r.created_at,
  currency: r.currency ?? 'ARS',
  originalAmount: r.original_amount != null ? Number(r.original_amount) : null,
  cardId: r.card_id,
})

/**
 * Guarda los gastos en Postgres (Supabase). Row Level Security garantiza
 * que cada usuario sólo lee y escribe sus propias filas — ver supabase/schema.sql.
 */
export class SupabaseRepository implements ExpenseRepository {
  private db: SupabaseClient
  private userId: string

  constructor(db: SupabaseClient, userId: string) {
    this.db = db
    this.userId = userId
  }

  async list() {
    // PostgREST pagina de a 1000 filas: pedimos de a bloques hasta traer todo.
    const pageSize = 1000
    const all: Expense[] = []
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.db
        .from('expenses')
        .select('*')
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) throw error
      all.push(...(data as ExpenseRow[]).map(fromRow))
      if (!data || data.length < pageSize) break
    }
    return all
  }

  async add(input: NewExpense) {
    const { data, error } = await this.db
      .from('expenses')
      .insert({ ...toRow(input), user_id: this.userId })
      .select()
      .single()
    if (error) throw error
    return fromRow(data as ExpenseRow)
  }

  async update(id: string, input: NewExpense) {
    const { data, error } = await this.db.from('expenses').update(toRow(input)).eq('id', id).select().single()
    if (error) throw error
    return fromRow(data as ExpenseRow)
  }

  async remove(id: string) {
    const { error } = await this.db.from('expenses').delete().eq('id', id)
    if (error) throw error
  }

  /** Reemplaza todos los gastos del usuario (importar backup / borrar todo). */
  async replaceAll(expenses: Expense[]) {
    const { error: delError } = await this.db.from('expenses').delete().eq('user_id', this.userId)
    if (delError) throw delError
    await this.insertMany(expenses)
  }

  /** Inserta en bloques; los ids que no son UUID (p. ej. del modo local) se regeneran. */
  async insertMany(expenses: Expense[]) {
    const rows = expenses.map((e) => ({
      ...toRow(e),
      id: UUID.test(e.id) ? e.id : newId(), // todas las filas con id: upsert en bloque lo requiere
      user_id: this.userId,
      created_at: e.createdAt,
    }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await this.db.from('expenses').upsert(rows.slice(i, i + 500))
      if (error) throw error
    }
  }

  async getSettings(): Promise<Settings> {
    const { data, error } = await this.db
      .from('user_settings')
      .select('monthly_budget, usd_card_rate, usd_mep_rate, cards, savings')
      .eq('user_id', this.userId)
      .maybeSingle()
    if (error) throw error
    return normalizeSettings({
      monthlyBudget: data?.monthly_budget,
      usdCardRate: data?.usd_card_rate,
      usdMepRate: data?.usd_mep_rate,
      cards: data?.cards,
      savings: data?.savings,
    })
  }

  async saveSettings(settings: Settings) {
    const { error } = await this.db
      .from('user_settings')
      .upsert({
        user_id: this.userId,
        monthly_budget: settings.monthlyBudget,
        usd_card_rate: settings.usdCardRate,
        usd_mep_rate: settings.usdMepRate,
        cards: settings.cards,
        savings: settings.savings,
        updated_at: new Date().toISOString(),
      })
    if (error) throw error
  }
}
