import { SidebarTrigger } from "@/components/ui/sidebar"

interface PageHeaderProps {
  title: string
  actions?: React.ReactNode
}

/** A slim title bar pinned to the top of the content panel. */
export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-6 flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background/85 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 md:rounded-t-lg">
      <SidebarTrigger className="-ml-1.5 text-muted-foreground" />
      <h1 className="text-sm font-medium">{title}</h1>
      {actions && <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
