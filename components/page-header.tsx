import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-5" />
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      </div>
      {(description || actions) && (
        <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          {description && (
            <p className="min-w-0 text-sm text-muted-foreground">{description}</p>
          )}
          {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
        </div>
      )}
    </div>
  )
}
