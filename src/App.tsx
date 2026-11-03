import { useEffect, useMemo, useRef, useState } from 'react'
import type { Expense, MonthKey, NewExpense } from './types'
import type { ExpenseRepository } from './data/repository'
import type { SupabaseRepository } from './data/supabaseRepository'
import { useExpenses } from './hooks/useExpenses'
import { currentMonth, shiftMonth, todayISO } from './lib/dates'
import { monthLabel } from './lib/format'
import { expensesInMonth, monthlyTotals, spreadInstallments, summarize, totalsByCategory } from './lib/stats'
import { generateDemoExpenses, generateDemoSettings } from './lib/demo'
import { ExpenseForm } from './components/ExpenseForm'
import { KpiRow } from './components/KpiRow'
import { CategoryBreakdown } from './components/CategoryBreakdown'
import { MonthlyTrend } from './components/MonthlyTrend'
import { ExpenseList } from './components/ExpenseList'
import { DataPanel } from './components/DataPanel'
import { AccountMenu } from './components/AccountMenu'
import { AppearanceMenu } from './components/AppearanceMenu'
import { TabIcon } from './components/TabIcon'
import { CardsView } from './components/CardsView'
import { CardAlerts } from './components/CardAlerts'
import { SavingsView } from './components/SavingsView'
import { CategoriesManager } from './components/CategoriesManager'
import { statementFor } from './lib/cards'
import { fetchRate } from './lib/rates'
import { buildCatalog, mergeCategories, type CategoryDraft } from './lib/categories'
import { newId } from './lib/settings'
import type { CustomCategory, Settings } from './types'

export type Account =
  | { kind: 'local' }
  | { kind: 'guest'; onSignIn: () => void }
  | {
      kind: 'cloud'
      name: string
      email: string
      avatarUrl?: string
      onSignOut: () => void
      /** Para ofrecer subir lo que quedó guardado en el navegador */
      localRepo: ExpenseRepository
    }

interface Props {
  repo: ExpenseRepository
  account: Account
}

const MIGRATION_DISMISSED_KEY = 'cuentas-claras:migration-dismissed'

type Tab = 'gastos' | 'tarjetas' | 'ahorros'
const TABS: { id: Tab; label: string }[] = [
  { id: 'gastos', label: 'Gastos' },
  { id: 'tarjetas', label: 'Tarjetas' },
  { id: 'ahorros', label: 'Ahorros' },
]
const tabFromHash = (): Tab => {
  const h = window.location.hash.slice(1)
  return h === 'tarjetas' || h === 'ahorros' ? h : 'gastos'
}

export default function App({ repo, account }: Props) {
  const { expenses, settings, loading, loadError, reload, add, update, remove, replaceAll, saveSettings } =
    useExpenses(repo)
  const isCloud = account.kind === 'cloud'
  const [month, setMonth] = useState<MonthKey>(() => currentMonth())
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [toast, setToast] = useState<{ message: string; action?: { label: string; run: () => void } } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  // En el celu el formulario vive en una hoja que sube desde abajo
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheetOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    const t = window.setTimeout(() => document.getElementById('expense-amount')?.focus(), 220)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('no-scroll')
      window.clearTimeout(t)
    }
  }, [sheetOpen])
  const [tab, setTabState] = useState<Tab>(tabFromHash)
  const [liveRates, setLiveRates] = useState<{ tarjeta: number | null; bolsa: number | null }>({ tarjeta: null, bolsa: null })

  function setTab(t: Tab) {
    setTabState(t)
    try {
      window.history.replaceState(null, '', t === 'gastos' ? window.location.pathname : `#${t}`)
    } catch {
      /* algunos entornos no permiten tocar el historial */
    }
    window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Cotizaciones del día; si la API no responde, quedan las cargadas a mano
  useEffect(() => {
    let alive = true
    Promise.all([fetchRate('tarjeta'), fetchRate('bolsa')]).then(([t, b]) => {
      if (alive) setLiveRates({ tarjeta: t?.venta ?? null, bolsa: b?.venta ?? null })
    })
    return () => {
      alive = false
    }
  }, [])

  // La cotización manual, si existe, tiene prioridad sobre la automática
  const usdCardRate = settings.usdCardRate ?? liveRates.tarjeta
  const usdCardRateSource = settings.usdCardRate ? 'manual' : liveRates.tarjeta ? 'api' : null
  const mep = settings.usdMepRate ?? liveRates.bolsa
  const mepSource = settings.usdMepRate ? 'manual' : liveRates.bolsa ? 'api' : null

  const cardAlerts = useMemo(
    () => settings.cards.map((c) => statementFor(c, expenses)).filter((s) => s.shouldAlert),
    [settings.cards, expenses],
  )

  async function patchSettings(patch: Partial<Settings>, okMessage?: string) {
    try {
      await saveSettings({ ...settings, ...patch })
      if (okMessage) notify(okMessage)
      return true
    } catch {
      notify('No se pudo guardar. Revisá tu conexión y probá de nuevo.')
      return false
    }
  }

  function notify(message: string, action?: { label: string; run: () => void }) {
    setToast({ message, action })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 6000 : 2400)
  }

  // ---- Categorías propias ----
  const catalog = useMemo(() => buildCatalog(settings.categories), [settings.categories])
  // Último settings guardado: el "Deshacer" corre segundos después y no tiene que pisar cambios hechos mientras tanto
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  async function saveCategories(
    next: (prev: CustomCategory[]) => CustomCategory[],
    okMessage?: string,
    action?: { label: string; run: () => void },
  ) {
    const current = settingsRef.current
    try {
      const updated = { ...current, categories: next(current.categories) }
      await saveSettings(updated)
      settingsRef.current = updated
      if (okMessage) notify(okMessage, action)
      return true
    } catch {
      notify('No se pudo guardar. Revisá tu conexión y probá de nuevo.')
      return false
    }
  }

  async function createCategory(draft: CategoryDraft) {
    const created: CustomCategory = { id: newId(), ...draft, archived: false }
    const ok = await saveCategories((prev) => [...prev, created], `Categoría "${created.name}" creada`)
    return ok ? created : null
  }

  const setArchived = (id: string, archived: boolean) => (prev: CustomCategory[]) =>
    prev.map((c) => (c.id === id ? { ...c, archived } : c))

  function restoreCategory(id: string) {
    saveCategories(setArchived(id, false), 'Categoría reactivada')
  }

  /** Con gastos se archiva (los gastos viejos la conservan); sin gastos se borra. Ambas con Deshacer. */
  function removeCategory(id: string) {
    const index = settings.categories.findIndex((c) => c.id === id)
    const cat = settings.categories[index]
    if (!cat) return
    if (expenses.some((e) => e.categoryId === id)) {
      saveCategories(setArchived(id, true), `"${cat.name}" archivada`, {
        label: 'Deshacer',
        run: () => restoreCategory(id),
      })
    } else {
      saveCategories((prev) => prev.filter((c) => c.id !== id), `"${cat.name}" borrada`, {
        label: 'Deshacer',
        run: () => {
          saveCategories(
            (prev) => (prev.some((c) => c.id === id) ? prev : [...prev.slice(0, index), cat, ...prev.slice(index)]),
            'Categoría recuperada',
          )
        },
      })
    }
  }

  const thisMonth = currentMonth()
  // En Gastos, las compras en cuotas cuentan de a una cuota por mes
  const ledger = useMemo(() => spreadInstallments(expenses), [expenses])
  const monthExpenses = useMemo(() => expensesInMonth(ledger, month), [ledger, month])
  const summary = useMemo(() => summarize(ledger, month, catalog.get), [ledger, month, catalog])
  const byCategory = useMemo(() => totalsByCategory(ledger, month, catalog.get), [ledger, month, catalog])
  const trendEnd = month > thisMonth ? month : thisMonth
  const trend = useMemo(() => monthlyTotals(ledger, trendEnd, 6), [ledger, trendEnd])

  function goTo(m: MonthKey) {
    setMonth(m)
    setCategoryFilter(null)
  }

  async function handleSubmit(input: NewExpense, id?: string) {
    try {
      if (id) await update(id, input)
      else await add(input)
      return true
    } catch {
      return false
    }
  }

  // Borrar sin confirmación previa, con "Deshacer" en el aviso
  async function handleDelete(id: string) {
    const removed = expenses.find((e) => e.id === id)
    if (editing?.id === id) setEditing(null)
    try {
      await remove(id)
      notify('Gasto borrado', removed && {
        label: 'Deshacer',
        run: () => {
          const input: Partial<Expense> = { ...removed }
          delete input.id
          delete input.createdAt
          add(input as NewExpense).then(() => notify('Gasto recuperado')).catch(() => notify('No se pudo recuperar el gasto.'))
        },
      })
    } catch {
      notify('No se pudo borrar. Probá de nuevo.')
    }
  }

  async function handleBudget(v: number | null) {
    await patchSettings({ monthlyBudget: v })
  }

  // ---- Migración: gastos que quedaron en el navegador antes de iniciar sesión ----
  const [pendingLocal, setPendingLocal] = useState<Expense[]>([])
  const [migrating, setMigrating] = useState(false)
  const localRepo = account.kind === 'cloud' ? account.localRepo : null

  useEffect(() => {
    if (!localRepo || loading) return
    let dismissed = false
    try {
      dismissed = window.localStorage.getItem(MIGRATION_DISMISSED_KEY) === '1'
    } catch {
      /* sin storage */
    }
    if (dismissed) return
    let alive = true
    localRepo.list().then((list) => {
      // Ignoramos los datos de ejemplo: sólo ofrecemos subir gastos reales
      if (alive) setPendingLocal(list.filter((e) => !e.id.startsWith('demo-')))
    })
    return () => {
      alive = false
    }
  }, [localRepo, loading])

  function dismissMigration() {
    setPendingLocal([])
    try {
      window.localStorage.setItem(MIGRATION_DISMISSED_KEY, '1')
    } catch {
      /* sin storage */
    }
  }

  async function migrateLocal() {
    setMigrating(true)
    try {
      // Primero las categorías propias del navegador, así los gastos subidos no quedan con "❔"
      const localCats = (await localRepo?.getSettings())?.categories ?? []
      if (localCats.length) {
        const current = settingsRef.current
        const updated = { ...current, categories: mergeCategories(current.categories, localCats) }
        await saveSettings(updated)
        settingsRef.current = updated
      }
      await (repo as SupabaseRepository).insertMany(pendingLocal)
      await localRepo?.replaceAll([])
      notify(`Subidos ${pendingLocal.length} gastos a tu cuenta`)
      setPendingLocal([])
      reload()
    } catch {
      notify('No se pudieron subir los gastos. Probá de nuevo.')
    } finally {
      setMigrating(false)
    }
  }

  async function loadDemo() {
    const own = expenses.filter((e) => !e.id.startsWith('demo-'))
    await replaceAll([...own, ...generateDemoExpenses(thisMonth, 6, 42, todayISO())])
    if (!settings.cards.length && !settings.savings.length) await saveSettings(generateDemoSettings(thisMonth, settings))
    // Mostramos el último mes completo, que es el que más datos tiene
    goTo(shiftMonth(thisMonth, -1))
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>$</span>
          <div>
            <h1>Cuentas Claras</h1>
            <p className="tagline">Registrá tus gastos y mirá a dónde se va la plata</p>
          </div>
        </div>
        {tab === 'gastos' && (
        <nav className="month-nav" aria-label="Cambiar de mes">
          <button className="icon-btn" onClick={() => goTo(shiftMonth(month, -1))} aria-label="Mes anterior">‹</button>
          <span className="month-current" aria-live="polite">{monthLabel(month)}</span>
          <button className="icon-btn" onClick={() => goTo(shiftMonth(month, 1))} aria-label="Mes siguiente">›</button>
          {month !== thisMonth && (
            <button className="link" onClick={() => goTo(thisMonth)}>Hoy</button>
          )}
        </nav>
        )}
        <div className="top-actions">
          <AppearanceMenu />
          <AccountMenu account={account} />
        </div>
      </header>

      <nav className="tabs" aria-label="Secciones">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'is-on' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <TabIcon id={t.id} />
            <span>{t.label}</span>
            {t.id === 'tarjetas' && cardAlerts.length > 0 && <span className="badge" aria-label={`${cardAlerts.length} avisos`}>{cardAlerts.length}</span>}
          </button>
        ))}
      </nav>

      {account.kind === 'guest' && (
        <div className="notice">
          <span>Estás en modo invitado: los gastos quedan sólo en este navegador.</span>
          <button className="btn small primary" onClick={account.onSignIn}>Iniciar sesión con Google</button>
        </div>
      )}

      {pendingLocal.length > 0 && !loadError && !loading && (
        <div className="notice">
          <span>
            Tenés <strong>{pendingLocal.length} {pendingLocal.length === 1 ? 'gasto' : 'gastos'}</strong> {pendingLocal.length === 1 ? 'guardado' : 'guardados'} en este navegador. ¿Los subimos a tu cuenta?
          </span>
          <span className="notice-actions">
            <button className="btn small primary" onClick={migrateLocal} disabled={migrating}>
              {migrating ? 'Subiendo…' : 'Subir a mi cuenta'}
            </button>
            <button className="link" onClick={dismissMigration}>No, gracias</button>
          </span>
        </div>
      )}

      {loading ? (
        <p className="empty">Cargando tus datos…</p>
      ) : loadError ? (
        <div className="notice error">
          <span title={loadError}>No pudimos traer tus datos. Revisá tu conexión y probá de nuevo.</span>
          <button className="btn small" onClick={reload}>Reintentar</button>
        </div>
      ) : (
        <main>
          {tab !== 'tarjetas' && <CardAlerts alerts={cardAlerts} onOpenCards={() => setTab('tarjetas')} />}

          {tab === 'tarjetas' && (
            <CardsView
              cards={settings.cards}
              expenses={expenses}
              getCategory={catalog.get}
              usdCardRate={usdCardRate}
              usdCardRateSource={usdCardRateSource}
              onSaveCards={(cards) => patchSettings({ cards }, 'Tarjetas guardadas')}
              onSaveManualRate={(v) => patchSettings({ usdCardRate: v }, v ? 'Cotización guardada' : 'Usando la cotización automática')}
            />
          )}

          {tab === 'ahorros' && (
            <SavingsView
              accounts={settings.savings}
              mep={mep}
              mepSource={mepSource}
              onSave={(savings) => patchSettings({ savings }, 'Ahorros actualizados')}
              onSaveManualMep={(v) => patchSettings({ usdMepRate: v }, v ? 'Cotización guardada' : 'Usando la cotización automática')}
            />
          )}

          {tab === 'gastos' && (<>
          {expenses.length === 0 && pendingLocal.length === 0 && (
            <div className="welcome">
              <p>
                <strong>Arrancá cargando tu primer gasto</strong>
                {isCloud ? ' — se guarda en tu cuenta y lo ves desde cualquier dispositivo.' : ' o probá la app con datos de ejemplo de los últimos 6 meses.'}
              </p>
              {!isCloud && <button className="btn primary" onClick={loadDemo}>Ver con datos de ejemplo</button>}
            </div>
          )}

          <KpiRow
            summary={summary}
            budget={settings.monthlyBudget}
            isCurrentMonth={month === thisMonth}
            onBudgetChange={handleBudget}
          />

          <div className="grid">
            <div className={`col-side ${sheetOpen ? 'is-open' : ''}`}>
              <ExpenseForm
                key={editing?.id ?? 'new'}
                month={month}
                categories={catalog.active}
                getCategory={catalog.get}
                customCategories={settings.categories}
                onCreateCategory={createCategory}
                cards={settings.cards}
                usdCardRate={usdCardRate}
                onAddCard={() => {
                  setSheetOpen(false)
                  setTab('tarjetas')
                }}
                onSaved={(m) => {
                  notify(m)
                  setSheetOpen(false)
                }}
                editing={editing}
                onSubmit={handleSubmit}
                onCancelEdit={() => {
                  setEditing(null)
                  setSheetOpen(false)
                }}
                onClose={() => setSheetOpen(false)}
              />
            </div>
            <div className="col-main">
              <CategoryBreakdown rows={byCategory} selected={categoryFilter} onSelect={setCategoryFilter} />
              <MonthlyTrend data={trend} selected={month} onSelect={goTo} />
            </div>
          </div>

          <ExpenseList
            expenses={monthExpenses}
            getCategory={catalog.get}
            cards={settings.cards}
            categoryFilter={categoryFilter}
            onClearFilter={() => setCategoryFilter(null)}
            onEdit={(e) => {
              // Una cuota se edita como la compra completa
              const original = e.installment ? expenses.find((x) => x.id === e.installment?.sourceId) : e
              if (!original) return
              setEditing(original)
              setSheetOpen(true)
              if (window.matchMedia('(min-width: 861px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            onDelete={handleDelete}
            editingId={editing?.id ?? null}
          />

          <CategoriesManager
            categories={settings.categories}
            expenses={expenses}
            onCreate={async (d) => (await createCategory(d)) !== null}
            onUpdate={(id, d) =>
              saveCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...d } : c)), 'Categoría actualizada')
            }
            onRemove={removeCategory}
            onRestore={restoreCategory}
          />

          <DataPanel
            expenses={expenses}
            categories={catalog.all}
            customCategories={settings.categories}
            onImportCategories={async (list) => {
              if (!(await saveCategories((prev) => mergeCategories(prev, list)))) throw new Error('No se pudieron importar las categorías')
            }}
            onReplaceAll={replaceAll}
            onLoadDemo={isCloud ? undefined : loadDemo}
            storageLabel={isCloud ? 'Guardados en tu cuenta' : 'Se guardan en este navegador'}
          />
          </>)}
        </main>
      )}

      {tab === 'gastos' && !loading && !loadError && (
        <button className="fab" onClick={() => { setEditing(null); setSheetOpen(true) }} aria-label="Agregar gasto">
          <span aria-hidden>+</span> Gasto
        </button>
      )}
      <div className={`sheet-backdrop ${sheetOpen ? 'is-on' : ''}`} onClick={() => setSheetOpen(false)} aria-hidden />

      <div className={`toast ${toast ? 'is-on' : ''}`} role="status" aria-live="polite">
        <span>{toast?.message}</span>
        {toast?.action && (
          <button
            className="toast-action"
            onClick={() => {
              toast.action?.run()
              setToast(null)
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <footer className="footer">
        Hecho con React + TypeScript · Datos exportables a Power BI
      </footer>
    </div>
  )
}
