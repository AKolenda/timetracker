"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 w-full justify-start gap-2.5 px-2 font-medium text-sidebar-foreground pointer-coarse:h-10 [&_svg]:size-3.5 [&_svg]:text-muted-foreground"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
      <span className="text-sm">
        {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
      </span>
    </Button>
  )
}
