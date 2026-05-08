"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Clock,
  LayoutDashboard,
  Users,
  FolderKanban,
  Receipt,
  BarChart3,
  Timer,
  FileText,
  Settings,
  CalendarDays,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

const navItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Tracker", href: "/tracker", icon: Timer },
  { title: "Clients", href: "/clients", icon: Users },
  { title: "Projects", href: "/projects", icon: FolderKanban },
  { title: "Expenses", href: "/expenses", icon: Receipt },
  { title: "Reports", href: "/reports", icon: BarChart3 },
  { title: "Invoices", href: "/invoices", icon: FileText },
  { title: "Calendar", href: "/calendar", icon: CalendarDays },
  { title: "Settings", href: "/settings", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-border px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-foreground">
            <Clock className="size-4 text-background" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight">
              TimeTracker
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              v1.0.0
            </span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-widest">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href)
                    }
                  >
                    <Link href={item.href}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-border p-3">
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  )
}
