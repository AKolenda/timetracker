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
  activeTimers: [],
}

function mobileTestFixture(): AppData {
  const now = new Date()
  const trackedStart = new Date(now)
  trackedStart.setHours(14, 0, 0, 0)
  const trackedEnd = new Date(now)
  trackedEnd.setHours(15, 0, 0, 0)
  return {
    clients: [{ id: "fixture-client", name: "Fixture Client", email: "", phone: "", address: "", color: "", invoiceEmail: "", invoiceScheduleWeeks: null, invoiceScheduleAnchor: null, invoiceScheduleEnabled: false, invoiceScheduleAutoSend: false, lastInvoiceSent: null, createdAt: now.toISOString() }],
    projects: [{ id: "fixture-project", clientId: "fixture-client", name: "Fixture Project", rate: 100, currency: "USD", status: "active", color: "", createdAt: now.toISOString() }],
    timeEntries: [{ id: "fixture-entry", projectId: "fixture-project", description: "Existing tracked hour", startTime: trackedStart.toISOString(), endTime: trackedEnd.toISOString(), duration: 3600, billable: true, date: localDateString(trackedStart, Intl.DateTimeFormat().resolvedOptions().timeZone) }], expenses: [], invoices: [], settings: { ...defaultSettings, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    activeTimers: [{ id: "fixture-timer", projectId: "fixture-project", description: "Mobile timer fixture", startTime: new Date(now.getTime() - 65 * 60 * 1000).toISOString(), billable: true, accumulatedPause: 0, pausedAt: null }],
  }
}

function mobileTestFixtureRequested() {
  return typeof window !== "undefined" && process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" && new URLSearchParams(window.location.search).get("fixture") === "mobile"
}

interface StoreContext {
  data: AppData
  loading: boolean

  addClient: (client: Omit<Client, "id" | "createdAt">) => Promise<Client>
  updateClient: (id: string, updates: Partial<Client>) => Promise<void>
  deleteClient: (id: string) => Promise<void>

  addProject: (project: Omit<Project, "id" | "createdAt">) => Promise<Project>
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>
  mergeProject: (sourceId: string, targetId: string) => Promise<void>
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
  stopTimer: (id: string) => Promise<TimeEntry | null>
  pauseTimer: (id: string) => void
  resumeTimer: (id: string) => void
  clearTimer: (id: string) => void

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
    if (mobileTestFixtureRequested()) {
      setData(mobileTestFixture())
      setLoading(false)
      return
    }
    try {
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

      // Load active timers from Supabase (cross-browser), fall back to localStorage.
      let activeTimers: ActiveTimer[] = []
      try {
        activeTimers = await db.getActiveTimers()
      } catch {}
      if (!activeTimers.length && typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(TIMER_KEY)
          const stored = raw ? JSON.parse(raw) : []
          const timers = Array.isArray(stored) ? stored : stored ? [stored] : []
          activeTimers = timers.map((timer, index) => ({
            ...timer,
            id: timer.id ?? `legacy-${timer.startTime}-${index}`,
          }))
        } catch {}
      }
      // Keep localStorage in sync as a fast cache for same-browser tab sync
      if (typeof window !== "undefined") {
        localStorage.setItem(TIMER_KEY, JSON.stringify(activeTimers))
      }

      setData({
        clients,
        projects,
        timeEntries,
        expenses,
        invoices,
        settings,
        activeTimers,
      })
    } catch {
      // The app can still show its empty state while a database is unavailable.
      setData(defaultData)
    } finally {
      setLoading(false)
    }
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
      const stored = e.newValue ? JSON.parse(e.newValue) : []
      const timers = Array.isArray(stored) ? stored : stored ? [stored] : []
      setData((d) => ({ ...d, activeTimers: timers }))
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

  const mergeProject = useCallback(async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    const db = getDataProvider()
    const sourceEntries = data.timeEntries.filter((entry) => entry.projectId === sourceId)
    const sourceExpenses = data.expenses.filter((expense) => expense.projectId === sourceId)
    const migratedTimers = data.activeTimers.map((timer) =>
      timer.projectId === sourceId ? { ...timer, projectId: targetId } : timer
    )
    await Promise.all([
      ...sourceEntries.map((entry) => db.updateTimeEntry(entry.id, { projectId: targetId })),
      ...sourceExpenses.map((expense) => db.updateExpense(expense.id, { projectId: targetId })),
      ...(migratedTimers.some((timer, index) => timer !== data.activeTimers[index]) ? [db.setActiveTimers(migratedTimers)] : []),
    ])
    await db.deleteProject(sourceId)
    setData((d) => ({
      ...d,
      projects: d.projects.filter((project) => project.id !== sourceId),
      timeEntries: d.timeEntries.map((entry) => entry.projectId === sourceId ? { ...entry, projectId: targetId } : entry),
      expenses: d.expenses.map((expense) => expense.projectId === sourceId ? { ...expense, projectId: targetId } : expense),
      activeTimers: migratedTimers,
    }))
  }, [data.timeEntries, data.expenses])

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

  // --- Timers (Supabase for cross-browser, localStorage for fast same-browser tab sync) ---
  const startTimer = useCallback(async (timer: ActiveTimer) => {
    if (typeof window !== "undefined") {
      const current = data.activeTimers
      localStorage.setItem(TIMER_KEY, JSON.stringify([...current, timer]))
    }
    const next = [...data.activeTimers, timer]
    setData((d) => ({ ...d, activeTimers: next }))
    try {
      const db = getDataProvider()
      await db.setActiveTimers(next)
    } catch {}
  }, [data.activeTimers])

  const stopTimer = useCallback(async (id: string) => {
    let entry: TimeEntry | null = null
    const current = data.activeTimers.find((timer) => timer.id === id)
    if (!current) return null

    const now = new Date()
    const start = new Date(current.startTime)
    // Subtract accumulated pause time + any active pause right now
    let totalPaused = current.accumulatedPause ?? 0
    if (current.pausedAt) {
      totalPaused += Math.floor((now.getTime() - new Date(current.pausedAt).getTime()) / 1000)
    }
    const duration = Math.floor((now.getTime() - start.getTime()) / 1000) - totalPaused

    entry = await addTimeEntry({
      projectId: current.projectId,
      description: current.description,
      startTime: current.startTime,
      endTime: now.toISOString(),
      duration: Math.max(0, duration),
      billable: current.billable,
      date: localDateString(start, data.settings.timezone),
    })

    if (typeof window !== "undefined") {
      localStorage.setItem(TIMER_KEY, JSON.stringify(data.activeTimers.filter((timer) => timer.id !== id)))
    }
    const next = data.activeTimers.filter((timer) => timer.id !== id)
    setData((d) => ({ ...d, activeTimers: next }))
    try {
      const db = getDataProvider()
      await db.setActiveTimers(next)
    } catch {}
    return entry
  }, [data.activeTimers, data.settings.timezone, addTimeEntry])

  const pauseTimer = useCallback(async (id: string) => {
    const current = data.activeTimers.find((timer) => timer.id === id)
    if (!current || current.pausedAt) return
    const paused: ActiveTimer = {
      ...current,
      pausedAt: new Date().toISOString(),
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(TIMER_KEY, JSON.stringify(data.activeTimers.map((timer) => timer.id === id ? paused : timer)))
    }
    const next = data.activeTimers.map((timer) => timer.id === id ? paused : timer)
    setData((d) => ({ ...d, activeTimers: next }))
    try {
      const db = getDataProvider()
      await db.setActiveTimers(next)
    } catch {}
  }, [data.activeTimers])

  const resumeTimer = useCallback(async (id: string) => {
    const current = data.activeTimers.find((timer) => timer.id === id)
    if (!current || !current.pausedAt) return
    const pausedMs = Date.now() - new Date(current.pausedAt).getTime()
    const resumed: ActiveTimer = {
      ...current,
      pausedAt: null,
      accumulatedPause: (current.accumulatedPause ?? 0) + Math.floor(pausedMs / 1000),
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(TIMER_KEY, JSON.stringify(data.activeTimers.map((timer) => timer.id === id ? resumed : timer)))
    }
    const next = data.activeTimers.map((timer) => timer.id === id ? resumed : timer)
    setData((d) => ({ ...d, activeTimers: next }))
    try {
      const db = getDataProvider()
      await db.setActiveTimers(next)
    } catch {}
  }, [data.activeTimers])

  const clearTimer = useCallback(async (id: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(TIMER_KEY, JSON.stringify(data.activeTimers.filter((timer) => timer.id !== id)))
    }
    const next = data.activeTimers.filter((timer) => timer.id !== id)
    setData((d) => ({ ...d, activeTimers: next }))
    try {
      const db = getDataProvider()
      await db.setActiveTimers(next)
    } catch {}
  }, [data.activeTimers])

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
    mergeProject,
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
        pauseTimer,
        resumeTimer,
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
