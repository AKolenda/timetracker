"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import type {
  ActiveTimer,
  AppData,
  Client,
  Expense,
  Invoice,
  InvoiceLineItem,
  Project,
  Settings,
  TimeEntry,
} from "./types"
import { defaultSettings } from "./types"
import { getDataProvider } from "./db"
import { localDateString } from "./datetime"

const TIMER_KEY = "timetracker-active-timer"

const defaultData: AppData = {
  clients: [],
  projects: [],
  timeEntries: [],
  expenses: [],
  invoices: [],
  settings: defaultSettings,
  activeTimer: null,
}

interface StoreContext {
  data: AppData
  loading: boolean

  addClient: (client: Omit<Client, "id" | "createdAt">) => Promise<Client>
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>
  deleteClient: (id: string) => Promise<void>

  addProject: (project: Omit<Project, "id" | "createdAt">) => Promise<Project>
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>

  addTimeEntry: (entry: Omit<TimeEntry, "id">) => Promise<TimeEntry>
  updateTimeEntry: (id: string, updates: Partial<TimeEntry>) => Promise<void>
  deleteTimeEntry: (id: string) => Promise<void>

  addExpense: (expense: Omit<Expense, "id">) => Promise<Expense>
  updateExpense: (id: string, updates: Partial<Expense>) => Promise<void>
  deleteExpense: (id: string) => Promise<void>

  updateSettings: (updates: Partial<Settings>) => Promise<void>

  addInvoice: (
    invoice: Omit<Invoice, "id" | "createdAt" | "lineItems">,
    lineItems: Omit<InvoiceLineItem, "id" | "invoiceId">[]
  ) => Promise<Invoice>
  updateInvoice: (id: string, updates: Partial<Invoice>) => Promise<void>
  deleteInvoice: (id: string) => Promise<void>

  startTimer: (timer: ActiveTimer) => void
  stopTimer: () => Promise<TimeEntry | null>
  clearTimer: () => void

  getClient: (id: string) => Client | undefined
  getProject: (id: string) => Project | undefined
  getProjectsByClient: (clientId: string) => Project[]
  getTimeEntriesByProject: (projectId: string) => TimeEntry[]
  getExpensesByProject: (projectId: string) => Expense[]

  refresh: () => Promise<void>
}

const Context = createContext<StoreContext | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(defaultData)
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    const db = getDataProvider()
    const [clients, projects, timeEntries, expenses, invoices, settings] =
      await Promise.all([
        db.getClients(),
        db.getProjects(),
        db.getTimeEntries(),
        db.getExpenses(),
        db.getInvoices(),
        db.getSettings(),
      ])

    // Load active timer from Supabase (cross-browser), fall back to localStorage
    let activeTimer: ActiveTimer | null = null
    try {
      activeTimer = await db.getActiveTimer()
    } catch {}
    if (!activeTimer && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(TIMER_KEY)
        if (raw) activeTimer = JSON.parse(raw)
      } catch {}
    }
    // Keep localStorage in sync as a fast cache for same-browser tab sync
    if (typeof window !== "undefined") {
      if (activeTimer) {
        localStorage.setItem(TIMER_KEY, JSON.stringify(activeTimer))
      } else {
        localStorage.removeItem(TIMER_KEY)
      }
    }

    setData({
      clients,
      projects,
      timeEntries,
      expenses,
      invoices,
      settings,
      activeTimer,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Sync the active timer across tabs. The `storage` event fires in OTHER
  // tabs when localStorage is written, so starting / stopping / discarding
  // in one tab instantly updates every other open tab.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== TIMER_KEY) return
      const next: ActiveTimer | null = e.newValue ? JSON.parse(e.newValue) : null
      setData((d) => ({ ...d, activeTimer: next }))
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const refresh = useCallback(async () => {
    await loadAll()
  }, [loadAll])

  // --- Clients ---
  const addClient = useCallback(
    async (client: Omit<Client, "id" | "createdAt">) => {
      const db = getDataProvider()
      const newClient = await db.createClient(client)
      setData((d) => ({ ...d, clients: [newClient, ...d.clients] }))
      return newClient
    },
    []
  )

  const updateClient = useCallback(
    async (id: string, updates: Partial<Client>) => {
      const db = getDataProvider()
      await db.updateClient(id, updates)
      setData((d) => ({
        ...d,
        clients: d.clients.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      }))
    },
    []
  )

  const deleteClient = useCallback(async (id: string) => {
    const db = getDataProvider()
    await db.deleteClient(id)
    setData((d) => ({
      ...d,
      clients: d.clients.filter((c) => c.id !== id),
      projects: d.projects.filter((p) => p.clientId !== id),
      timeEntries: d.timeEntries.filter(
        (t) =>
          !d.projects.some((p) => p.clientId === id && p.id === t.projectId)
      ),
      expenses: d.expenses.filter(
        (e) =>
          !d.projects.some((p) => p.clientId === id && p.id === e.projectId)
      ),
    }))
  }, [])

  // --- Projects ---
  const addProject = useCallback(
    async (project: Omit<Project, "id" | "createdAt">) => {
      const db = getDataProvider()
      const newProject = await db.createProject(project)
      setData((d) => ({ ...d, projects: [newProject, ...d.projects] }))
      return newProject
    },
    []
  )

  const updateProject = useCallback(
    async (id: string, updates: Partial<Project>) => {
      const db = getDataProvider()
      await db.updateProject(id, updates)
      setData((d) => ({
        ...d,
        projects: d.projects.map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
      }))
    },
    []
  )

  const deleteProject = useCallback(async (id: string) => {
    const db = getDataProvider()
    await db.deleteProject(id)
    setData((d) => ({
      ...d,
      projects: d.projects.filter((p) => p.id !== id),
      timeEntries: d.timeEntries.filter((t) => t.projectId !== id),
      expenses: d.expenses.filter((e) => e.projectId !== id),
    }))
  }, [])

  // --- Time Entries ---
  const addTimeEntry = useCallback(
    async (entry: Omit<TimeEntry, "id">) => {
      const db = getDataProvider()
      const newEntry = await db.createTimeEntry(entry)
      setData((d) => ({
        ...d,
        timeEntries: [newEntry, ...d.timeEntries],
      }))
      return newEntry
    },
    []
  )

  const updateTimeEntry = useCallback(
    async (id: string, updates: Partial<TimeEntry>) => {
      const db = getDataProvider()
      await db.updateTimeEntry(id, updates)
      setData((d) => ({
        ...d,
        timeEntries: d.timeEntries.map((t) =>
          t.id === id ? { ...t, ...updates } : t
        ),
      }))
    },
    []
  )

  const deleteTimeEntry = useCallback(async (id: string) => {
    const db = getDataProvider()
    await db.deleteTimeEntry(id)
    setData((d) => ({
      ...d,
      timeEntries: d.timeEntries.filter((t) => t.id !== id),
    }))
  }, [])

  // --- Expenses ---
  const addExpense = useCallback(
    async (expense: Omit<Expense, "id">) => {
      const db = getDataProvider()
      const newExpense = await db.createExpense(expense)
      setData((d) => ({ ...d, expenses: [newExpense, ...d.expenses] }))
      return newExpense
    },
    []
  )

  const updateExpense = useCallback(
    async (id: string, updates: Partial<Expense>) => {
      const db = getDataProvider()
      await db.updateExpense(id, updates)
      setData((d) => ({
        ...d,
        expenses: d.expenses.map((e) =>
          e.id === id ? { ...e, ...updates } : e
        ),
      }))
    },
    []
  )

  const deleteExpense = useCallback(async (id: string) => {
    const db = getDataProvider()
    await db.deleteExpense(id)
    setData((d) => ({
      ...d,
      expenses: d.expenses.filter((e) => e.id !== id),
    }))
  }, [])

  // --- Settings ---
  const updateSettingsFn = useCallback(
    async (updates: Partial<Settings>) => {
      const db = getDataProvider()
      await db.updateSettings(updates)
      setData((d) => ({
        ...d,
        settings: { ...d.settings, ...updates },
      }))
    },
    []
  )

  // --- Invoices ---
  const addInvoice = useCallback(
    async (
      invoice: Omit<Invoice, "id" | "createdAt" | "lineItems">,
      lineItems: Omit<InvoiceLineItem, "id" | "invoiceId">[]
    ) => {
      const db = getDataProvider()
      const newInvoice = await db.createInvoice(invoice, lineItems)
      setData((d) => ({ ...d, invoices: [newInvoice, ...d.invoices] }))
      return newInvoice
    },
    []
  )

  const updateInvoice = useCallback(
    async (id: string, updates: Partial<Invoice>) => {
      const db = getDataProvider()
      await db.updateInvoice(id, updates)
      setData((d) => ({
        ...d,
        invoices: d.invoices.map((inv) =>
          inv.id === id ? { ...inv, ...updates } : inv
        ),
      }))
    },
    []
  )

  const deleteInvoice = useCallback(async (id: string) => {
    const db = getDataProvider()
    await db.deleteInvoice(id)
    setData((d) => ({
      ...d,
      invoices: d.invoices.filter((inv) => inv.id !== id),
    }))
  }, [])

  // --- Timer (Supabase for cross-browser, localStorage for fast same-browser tab sync) ---
  const startTimer = useCallback(async (timer: ActiveTimer) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(TIMER_KEY, JSON.stringify(timer))
    }
    setData((d) => ({ ...d, activeTimer: timer }))
    try {
      const db = getDataProvider()
      await db.setActiveTimer(timer)
    } catch {}
  }, [])

  const stopTimer = useCallback(async () => {
    let entry: TimeEntry | null = null
    const current = data.activeTimer
    if (!current) return null

    const now = new Date()
    const start = new Date(current.startTime)
    const duration = Math.floor((now.getTime() - start.getTime()) / 1000)

    entry = await addTimeEntry({
      projectId: current.projectId,
      description: current.description,
      startTime: current.startTime,
      endTime: now.toISOString(),
      duration,
      billable: current.billable,
      date: localDateString(start, data.settings.timezone),
    })

    if (typeof window !== "undefined") {
      localStorage.removeItem(TIMER_KEY)
    }
    setData((d) => ({ ...d, activeTimer: null }))
    try {
      const db = getDataProvider()
      await db.setActiveTimer(null)
    } catch {}
    return entry
  }, [data.activeTimer, data.settings.timezone, addTimeEntry])

  const clearTimer = useCallback(async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(TIMER_KEY)
    }
    setData((d) => ({ ...d, activeTimer: null }))
    try {
      const db = getDataProvider()
      await db.setActiveTimer(null)
    } catch {}
  }, [])

  // --- Lookups ---
  const getClient = useCallback(
    (id: string) => data.clients.find((c) => c.id === id),
    [data.clients]
  )

  const getProject = useCallback(
    (id: string) => data.projects.find((p) => p.id === id),
    [data.projects]
  )

  const getProjectsByClient = useCallback(
    (clientId: string) => data.projects.filter((p) => p.clientId === clientId),
    [data.projects]
  )

  const getTimeEntriesByProject = useCallback(
    (projectId: string) =>
      data.timeEntries.filter((t) => t.projectId === projectId),
    [data.timeEntries]
  )

  const getExpensesByProject = useCallback(
    (projectId: string) =>
      data.expenses.filter((e) => e.projectId === projectId),
    [data.expenses]
  )

  if (loading) {
    return null
  }

  return (
    <Context.Provider
      value={{
        data,
        loading,
        addClient,
        updateClient,
        deleteClient,
        addProject,
        updateProject,
        deleteProject,
        addTimeEntry,
        updateTimeEntry,
        deleteTimeEntry,
        addExpense,
        updateExpense,
        deleteExpense,
        updateSettings: updateSettingsFn,
        addInvoice,
        updateInvoice,
        deleteInvoice,
        startTimer,
        stopTimer,
        clearTimer,
        getClient,
        getProject,
        getProjectsByClient,
        getTimeEntriesByProject,
        getExpensesByProject,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  )
}

export function useStore() {
  const ctx = useContext(Context)
  if (!ctx) throw new Error("useStore must be used within StoreProvider")
  return ctx
}
