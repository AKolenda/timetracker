"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
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
import {
  Bot,
  CalendarDays,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Receipt,
  Settings,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

interface NavItem {
  title: string
  href: string
  icon: LucideIcon
}

interface NavSection {
  label: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    label: "Tracker",
    items: [
      { title: "Tracker", href: "/tracker", icon: Timer },
      { title: "Agentic Coding", href: "/agentic-coding", icon: Bot },
    ],
  },
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Workspace",
    items: [
      { title: "Calendar", href: "/calendar", icon: CalendarDays },
      { title: "Projects", href: "/projects", icon: FolderKanban },
      { title: "Clients", href: "/clients", icon: Users },
    ],
  },
  {
    label: "Billing",
    items: [
      { title: "Expenses", href: "/expenses", icon: Receipt },
      { title: "Invoices", href: "/invoices", icon: FileText },
    ],
  },
  {
    label: "Account",
    items: [{ title: "Settings", href: "/settings", icon: Settings }],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="px-3 pt-3 pb-1">
        <Link href="/" className="flex h-8 items-center gap-2 rounded-md px-2 hover:bg-sidebar-accent">
          <span className="grid size-5 place-items-center rounded-[5px] bg-primary text-[11px] font-semibold text-primary-foreground">T</span>
          <span className="text-sm font-medium">TimeTracker</span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-1 py-1">
        {navSections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="h-7 px-2 text-xs font-medium text-muted-foreground">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(pathname, item.href)}
                      className="h-7 gap-2.5 px-2 text-sm font-medium text-sidebar-foreground data-active:text-sidebar-accent-foreground [&_svg]:size-3.5 [&_svg]:text-muted-foreground data-active:[&_svg]:text-sidebar-accent-foreground"
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  )
}
