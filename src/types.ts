export type PaymentMethod = 'efectivo' | 'debito' | 'credito' | 'transferencia'

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'debito', label: 'Débito' },
  { id: 'credito', label: 'Crédito' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'efectivo', label: 'Efectivo' },
]

export type CategoryKind = 'fijo' | 'variable'

export interface Category {
  id: string
  name: string
  emoji: string
  kind: CategoryKind
}

/** Categoría creada por el usuario. Archivada: no se ofrece al cargar, pero los gastos viejos la conservan. */
export interface CustomCategory extends Category {
  archived: boolean
}

export type Currency = 'ARS' | 'USD'

export interface Expense {
  id: string
  /** ISO date, YYYY-MM-DD */
  date: string
  /** Monto en ARS (si fue en dólares, convertido con la cotización cargada). Siempre positivo. */
  amount: number
  categoryId: string
  description: string
  paymentMethod: PaymentMethod
  createdAt: string
  /** Moneda original del gasto. Si falta, es ARS. */
  currency?: Currency
  /** Monto en la moneda original (sólo para USD) */
  originalAmount?: number | null
  /** Tarjeta usada, si paymentMethod es 'credito' */
  cardId?: string | null
  /** Cuotas (sólo crédito en pesos). Si falta o es 1, es en un pago. `amount` es siempre el total. */
  installments?: number | null
}

export type NewExpense = Omit<Expense, 'id' | 'createdAt'>

/** Mes en formato YYYY-MM */
export type MonthKey = string

export interface CreditCard {
  id: string
  /** Ej: "Visa Galicia" */
  name: string
  /** Día del mes en que cierra el resumen (1-31) */
  closingDay: number
  /** Día del mes en que vence (1-31). Si es menor que el cierre, vence el mes siguiente. */
  dueDay: number
  /** Si el pago se debita solo de la cuenta en pesos */
  autoDebit: boolean
  /** Cuántos días antes del vencimiento avisar */
  remindDaysBefore: number
}

export type SavingsKind = 'broker' | 'banco' | 'billetera' | 'efectivo' | 'otro'

export interface BalanceEntry {
  /** YYYY-MM-DD */
  date: string
  amount: number
  /** Dólar MEP al momento de cargar el saldo, para valuar en USD con el tipo de cambio de ese día */
  mep?: number | null
}

export interface SavingsAccount {
  id: string
  /** Ej: "Ecovalores", "IOL", "Caja de ahorro USD" */
  name: string
  kind: SavingsKind
  currency: Currency
  /** Saldos registrados, del más viejo al más nuevo */
  history: BalanceEntry[]
}

export interface Settings {
  monthlyBudget: number | null
  /** Cotización por defecto para gastos en USD (dólar tarjeta) */
  usdCardRate: number | null
  /** Cotización para valuar ahorros en USD (dólar MEP) */
  usdMepRate: number | null
  cards: CreditCard[]
  savings: SavingsAccount[]
  /** Categorías propias (se suman a las de fábrica) */
  categories: CustomCategory[]
}

export const DEFAULT_SETTINGS: Settings = {
  monthlyBudget: null,
  usdCardRate: null,
  usdMepRate: null,
  cards: [],
  savings: [],
  categories: [],
}
