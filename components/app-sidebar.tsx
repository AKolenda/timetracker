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
import { ThemeToggle } from "@/components/theme-toggle"

interface NavItem {
  title: string
  href: string
}

interface NavSection {
  label: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    label: "Tracker",
    items: [{ title: "Tracker", href: "/tracker" }],
  },
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/" },
      { title: "Reports", href: "/reports" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { title: "Calendar", href: "/calendar" },
      { title: "Projects", href: "/projects" },
      { title: "Clients", href: "/clients" },
    ],
  },
  {
    label: "Billing",
    items: [
      { title: "Expenses", href: "/expenses" },
      { title: "Invoices", href: "/invoices" },
    ],
  },
  {
    label: "Account",
    items: [{ title: "Settings", href: "/settings" }],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-border px-5 py-4">
        <Link href="/" className="block">
          <span className="font-heading text-base font-semibold tracking-tight">
            TimeTracker
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        {navSections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="px-3 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(pathname, item.href)}
                      className="px-3 py-1.5 text-sm font-normal"
                    >
                      <Link href={item.href}>
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

      <SidebarFooter className="border-t border-border p-3">
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  )
}
