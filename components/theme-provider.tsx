"use client"

import * as React from "react"

type Theme = "light" | "dark"

const ThemeContext = React.createContext<{
  resolvedTheme: Theme
  setTheme: (theme: Theme) => void
} | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [resolvedTheme, setResolvedTheme] = React.useState<Theme>(() => {
    if (typeof window === "undefined") return "light"
    const saved = localStorage.getItem("timetracker-theme") as Theme | null
    if (saved === "dark" || saved === "light") return saved
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  })

  const setTheme = React.useCallback((theme: Theme) => {
    setResolvedTheme(theme)
    localStorage.setItem("timetracker-theme", theme)
  }, [])

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
  }, [resolvedTheme])

  return <ThemeContext.Provider value={{ resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const theme = React.useContext(ThemeContext)
  if (!theme) throw new Error("useTheme must be used within ThemeProvider")
  return theme
}
