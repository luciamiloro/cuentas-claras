import { useCallback, useEffect, useState } from 'react'
import type { Expense, NewExpense, Settings } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import type { ExpenseRepository } from '../data/repository'

/** Estado de gastos + operaciones, sobre cualquier implementación del repositorio. */
export function useExpenses(repository: ExpenseRepository) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([repository.list(), repository.getSettings()])
      .then(([list, s]) => {
        if (!alive) return
        setExpenses(list)
        setSettings(s)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (!alive) return
        // Los errores de Supabase son objetos { message }, no instancias de Error
        const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err)
        console.error('No se pudieron cargar los gastos:', err)
        setLoadError(msg || 'error desconocido')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [repository, reloadKey])

  const reload = useCallback(() => {
    setLoading(true)
    setReloadKey((k) => k + 1)
  }, [])

  const add = useCallback(
    async (input: NewExpense) => {
      const created = await repository.add(input)
      setExpenses((prev) => [...prev, created])
      return created
    },
    [repository],
  )

  const update = useCallback(
    async (id: string, input: NewExpense) => {
      const updated = await repository.update(id, input)
      setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)))
      return updated
    },
    [repository],
  )

  const remove = useCallback(
    async (id: string) => {
      await repository.remove(id)
      setExpenses((prev) => prev.filter((e) => e.id !== id))
    },
    [repository],
  )

  const replaceAll = useCallback(
    async (list: Expense[]) => {
      await repository.replaceAll(list)
      setExpenses(await repository.list())
    },
    [repository],
  )

  const saveSettings = useCallback(
    async (s: Settings) => {
      await repository.saveSettings(s)
      setSettings(s)
    },
    [repository],
  )

  return { expenses, settings, loading, loadError, reload, add, update, remove, replaceAll, saveSettings }
}
