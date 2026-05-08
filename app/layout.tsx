import { Geist_Mono, Inter } from "next/font/google"
import type { Metadata } from "next"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { StoreProvider } from "@/lib/store"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "TimeTracker",
  description: "Track time, clients, projects, and expenses",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, inter.variable)}
    >
      <body className="font-sans">
        <ThemeProvider>
          <TooltipProvider>
            <StoreProvider>
              <SidebarProvider>
                <AppSidebar />
                <SidebarInset className="min-w-0">
                  <div className="p-6">{children}</div>
                </SidebarInset>
              </SidebarProvider>
              <Toaster />
            </StoreProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
