"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  Clock3,
  FolderKanban,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageHeader } from "@/components/page-header"
import { formatDuration } from "@/lib/format"

const AGENT_TIME_START_DATE = "2026-08-30"

type AgentTimeSourceInterval = {
  start: string
  end: string
  durationSeconds: number
  agent: string
  source: string
  model: string
  conversationId: string
  conversationTitle: string
}

type AgentTimeBlock = {
  id: string
  start: string
  end: string
  project: string
  agents: string[]
  sources?: string[]
  sourceIntervals?: AgentTimeSourceInterval[]
  live?: boolean
}

type AgentTimeResponse = {
  fetchedAt?: string
  projects: string[]
  intervals: AgentTimeBlock[]
}

type Activity = AgentTimeSourceInterval & {
  blockId: string
  project: string
  live: boolean
  sourceLabel: string
  startMs: number
  endMs: number
}

type ActivitySpan = {
  start: number
  end: number
}

type Conversation = {
  key: string
  project: string
  sourceLabel: string
  source: string
  agent: string
  model: string
  conversationId: string
  conversationTitle: string
  live: boolean
  start: number
  end: number
  durationSeconds: number
  spans: ActivitySpan[]
}

function mobileFixtureRequested() {
  return typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" &&
    new URLSearchParams(window.location.search).get("fixture") === "mobile"
}

function sourceLabel(source: string, agent: string) {
  const combined = `${source} ${agent}`.toLowerCase()
  if (source.toLowerCase().includes("t3")) return "T3 Code"
  if (combined.includes("claude") || combined.includes("fable")) return "Claude"
  if (combined.includes("codex") || combined.includes("chatgpt") || combined.includes("openai")) return "Codex"
  return source || agent || "Other"
}

function sourceColor(label: string) {
  if (label === "Claude") return "bg-[#d97757]"
  if (label === "Codex") return "bg-emerald-500"
  if (label === "T3 Code") return "bg-violet-500"
  return "bg-sky-500"
}

function SourceLogo({ label, className = "size-8" }: { label: string; className?: string }) {
  if (label === "T3 Code") {
    return <span className={`grid shrink-0 place-items-center rounded-md bg-gradient-to-br from-indigo-400 via-violet-600 to-indigo-950 text-[0.6rem] font-black tracking-tighter text-white shadow-sm ${className}`} aria-label="T3 Code logo">T3</span>
  }
  if (label === "Claude") {
    return <span className={`grid shrink-0 place-items-center rounded-md bg-[#d97757] text-white shadow-sm ${className}`} aria-label="Claude logo"><svg viewBox="0 0 24 24" className="size-[72%]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7M8.2 3.4l7.6 17.2M20.6 8.2 3.4 15.8M15.8 3.4 8.2 20.6M3.4 8.2l17.2 7.6" /></svg></span>
  }
  if (label === "Codex") {
    return <span className={`grid shrink-0 place-items-center rounded-md bg-emerald-600 text-white shadow-sm ${className}`} aria-label="Codex logo"><svg viewBox="0 0 24 24" className="size-[76%]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M11.217 19.384A3.501 3.501 0 0 0 18 18.167V13l-6-3.35" /><path d="M5.214 15.014A3.501 3.501 0 0 0 9.66 20.28L14 17.746V10.8" /><path d="M6 7.63c-1.391-.236-2.787.395-3.534 1.689a3.474 3.474 0 0 0 1.271 4.745L8 16.578l6-3.348" /><path d="M12.783 4.616A3.501 3.501 0 0 0 6 5.833V10.9l6 3.45" /><path d="M18.786 8.986A3.501 3.501 0 0 0 14.34 3.72L10 6.254V13.2" /><path d="M18 16.302c1.391.236 2.787-.395 3.534-1.689a3.474 3.474 0 0 0-1.271-4.745l-4.308-2.514L10 10.774" /></svg></span>
  }
  return <span className={`grid shrink-0 place-items-center rounded-md bg-sky-600 text-[0.65rem] font-bold text-white shadow-sm ${className}`} aria-label={`${label} logo`}>{label.slice(0, 2).toUpperCase()}</span>
}

function mergeSpans(spans: ActivitySpan[]) {
  const merged: ActivitySpan[] = []
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1)
    if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end)
    else merged.push({ ...span })
  }
  return merged
}

function unionSeconds(spans: ActivitySpan[]) {
  return mergeSpans(spans).reduce(
    (total, span) => total + Math.max(0, Math.floor((span.end - span.start) / 1000)),
    0
  )
}

function buildConversations(activities: Activity[]) {
  const grouped = new Map<string, Omit<Conversation, "start" | "end" | "durationSeconds" | "spans"> & { spans: ActivitySpan[] }>()
  for (const activity of activities) {
    let segmentStart = activity.startMs
    while (segmentStart < activity.endMs) {
      const nextDay = new Date(segmentStart)
      nextDay.setHours(24, 0, 0, 0)
      const segmentEnd = Math.min(activity.endMs, nextDay.getTime())
      const activityDate = format(new Date(segmentStart), "yyyy-MM-dd")
      const fallbackIdentity = `${activity.model}:${activityDate}`
      const identity = activity.conversationId || activity.conversationTitle || fallbackIdentity
      const key = `${activityDate}:${activity.project}:${activity.sourceLabel}:${identity}`
      const current = grouped.get(key)
      if (current) {
        current.spans.push({ start: segmentStart, end: segmentEnd })
        current.live ||= activity.live
      } else {
        grouped.set(key, {
          key,
          project: activity.project,
          sourceLabel: activity.sourceLabel,
          source: activity.source,
          agent: activity.agent,
          model: activity.model,
          conversationId: activity.conversationId,
          conversationTitle: activity.conversationTitle,
          live: activity.live,
          spans: [{ start: segmentStart, end: segmentEnd }],
        })
      }
      segmentStart = segmentEnd
    }
  }

  return [...grouped.values()].map((conversation) => {
    const spans = mergeSpans(conversation.spans)
    return {
      ...conversation,
      spans,
      start: spans[0].start,
      end: spans.at(-1)!.end,
      durationSeconds: unionSeconds(spans),
    }
  }).sort((a, b) => b.start - a.start)
}

function DayTimeline({ conversations }: { conversations: Conversation[] }) {
  const dayReference = new Date(conversations[0].start)
  const dayStart = new Date(dayReference)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const start = dayStart.getTime()
  const end = dayEnd.getTime()
  const duration = Math.max(1, end - start)
  const labels = [...new Set(conversations.map((conversation) => conversation.sourceLabel))]

  return (
    <div className="grid min-w-0 gap-2 rounded-lg border bg-muted/10 p-3" data-testid="agentic-day-timeline">
      {labels.map((label) => (
        <div key={label} className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-2">
          <SourceLogo label={label} className="size-8" />
          <div className="relative h-8 min-w-0 overflow-hidden rounded-md border bg-background/40" aria-label={`${label} daily timeline`}>
            {conversations.filter((conversation) => conversation.sourceLabel === label).flatMap((conversation) =>
              conversation.spans.map((span, index) => {
                const spanStart = Math.max(start, span.start)
                const spanEnd = Math.min(end, span.end)
                if (spanEnd <= spanStart) return null
                return <span key={`${conversation.key}-${span.start}-${index}`} className={`absolute inset-y-1 min-w-px cursor-help rounded-[4px] ${sourceColor(label)}`} style={{ left: `${((spanStart - start) / duration) * 100}%`, width: `${((spanEnd - spanStart) / duration) * 100}%` }} title={`${conversation.conversationTitle || label} · ${format(new Date(spanStart), "h:mm:ss a")}–${format(new Date(spanEnd), "h:mm:ss a")}`} />
              })
            )}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 text-[0.6rem] text-muted-foreground">
        <span />
        <div className="flex justify-between font-mono"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span></div>
      </div>
    </div>
  )
}

function ConversationRow({ conversation }: { conversation: Conversation }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="min-w-0 border-t first:border-t-0" data-testid="agentic-conversation">
      <button type="button" className="grid w-full min-w-0 cursor-pointer gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/20 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] sm:items-center" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <div className="flex min-w-0 items-start gap-3">
          <SourceLogo label={conversation.sourceLabel} />
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{conversation.conversationTitle || `${conversation.sourceLabel} coding session`}</p>
            <p className="mt-0.5 break-words text-xs text-muted-foreground">{conversation.sourceLabel}{conversation.source === "T3 Code" ? ` using ${conversation.agent}` : ""}{conversation.model && conversation.model !== conversation.agent ? ` · ${conversation.model}` : ""}</p>
          </div>
        </div>
        <div className="min-w-0">
          <p className="break-words text-xs font-medium">{conversation.project}</p>
          <p className="mt-0.5 font-mono text-[0.7rem] text-muted-foreground">{format(new Date(conversation.start), "h:mm a")} – {format(new Date(conversation.end), "h:mm a")}</p>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          {conversation.live && <Badge variant="secondary" className="text-[0.65rem]">Live</Badge>}
          <span className="font-mono text-xs">{formatDuration(conversation.durationSeconds)}</span>
          <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>
      {expanded && (
        <div className="grid min-w-0 gap-3 border-t bg-muted/10 px-3 py-3 text-xs">
          <div className="grid min-w-0 gap-1 sm:grid-cols-2">
            <p className="break-all text-muted-foreground">Chat ID: <span className="font-mono text-foreground">{conversation.conversationId || "Not supplied"}</span></p>
            <p className="text-muted-foreground sm:text-right">{conversation.spans.length} contributing {conversation.spans.length === 1 ? "span" : "spans"}</p>
          </div>
          <div className="grid min-w-0 gap-1 border-l pl-3 font-mono text-[0.7rem] text-muted-foreground">
            {conversation.spans.map((span, index) => <p key={`${span.start}-${span.end}-${index}`}>{format(new Date(span.start), "MMM d, h:mm:ss a")} – {format(new Date(span.end), "h:mm:ss a")} · {formatDuration(Math.floor((span.end - span.start) / 1000))}</p>)}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AgenticCodingPage() {
  const [agentTime, setAgentTime] = useState<AgentTimeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState("all")
  const [projectOpen, setProjectOpen] = useState(false)
  const [range, setRange] = useState("7d")
  const [search, setSearch] = useState("")
  const [selectedSource, setSelectedSource] = useState("all")

  const loadAgentTime = useCallback(async (showToast = false) => {
    setLoading(true)
    try {
      const fixture = mobileFixtureRequested() ? "&fixture=mobile" : ""
      const response = await fetch(`/api/agent-time?gapMinutes=0&includeLive=true&from=${AGENT_TIME_START_DATE}${fixture}`)
      if (!response.ok) throw new Error("Agent Time is not available")
      setAgentTime(await response.json() as AgentTimeResponse)
      if (showToast) toast.success("Agentic coding activity refreshed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load Agent Time")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => void loadAgentTime(), 0)
    return () => window.clearTimeout(id)
  }, [loadAgentTime])

  const activities = useMemo(() => agentTime?.intervals.flatMap((block) => {
    const sourceIntervals = block.sourceIntervals?.length ? block.sourceIntervals : [{
      start: block.start,
      end: block.end,
      durationSeconds: Math.max(0, Math.floor((new Date(block.end).getTime() - new Date(block.start).getTime()) / 1000)),
      agent: block.agents[0] || "Other",
      source: block.sources?.[0] || block.agents[0] || "Other",
      model: "",
      conversationId: "",
      conversationTitle: "",
    }]
    return sourceIntervals.flatMap((interval) => {
      const startMs = new Date(interval.start).getTime()
      const endMs = new Date(interval.end).getTime()
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return []
      return [{ ...interval, blockId: block.id, project: block.project, live: block.live === true, sourceLabel: sourceLabel(interval.source, interval.agent), startMs, endMs }]
    })
  }) ?? [], [agentTime])

  const rangeStart = useMemo(() => {
    if (range === "all") return new Date(`${AGENT_TIME_START_DATE}T00:00:00`).getTime()
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    if (range === "7d") start.setDate(start.getDate() - 6)
    if (range === "30d") start.setDate(start.getDate() - 29)
    return start.getTime()
  }, [range])

  const baseActivities = useMemo(() => {
    const query = search.trim().toLowerCase()
    return activities.flatMap((activity) => {
      if (activity.endMs <= rangeStart) return []
      if (project !== "all" && activity.project !== project) return []
      const searchable = `${activity.project} ${activity.sourceLabel} ${activity.agent} ${activity.model} ${activity.conversationId} ${activity.conversationTitle}`.toLowerCase()
      if (query && !searchable.includes(query)) return []
      return [{ ...activity, startMs: Math.max(activity.startMs, rangeStart) }]
    })
  }, [activities, project, rangeStart, search])

  const sourceStats = useMemo(() => [...new Set(baseActivities.map((activity) => activity.sourceLabel))].map((label) => {
    const matching = baseActivities.filter((activity) => activity.sourceLabel === label)
    return {
      label,
      seconds: unionSeconds(matching.map((activity) => ({ start: activity.startMs, end: activity.endMs }))),
      conversations: buildConversations(matching).length,
    }
  }).sort((a, b) => b.seconds - a.seconds), [baseActivities])

  const effectiveSelectedSource = selectedSource === "all" || sourceStats.some((stat) => stat.label === selectedSource)
    ? selectedSource
    : "all"
  const visibleActivities = useMemo(
    () => effectiveSelectedSource === "all" ? baseActivities : baseActivities.filter((activity) => activity.sourceLabel === effectiveSelectedSource),
    [baseActivities, effectiveSelectedSource]
  )
  const conversations = useMemo(() => buildConversations(visibleActivities), [visibleActivities])
  const totalSeconds = useMemo(() => unionSeconds(visibleActivities.map((activity) => ({ start: activity.startMs, end: activity.endMs }))), [visibleActivities])
  const visibleProjects = new Set(visibleActivities.map((activity) => activity.project)).size
  const dayGroups = useMemo(() => {
    const groups = new Map<string, Conversation[]>()
    for (const conversation of conversations) {
      const date = format(new Date(conversation.start), "yyyy-MM-dd")
      const current = groups.get(date) ?? []
      current.push(conversation)
      groups.set(date, current)
    }
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [conversations])

  return (
    <>
      <PageHeader
        title="Agentic Coding"
        description="Master activity across Claude, Codex, T3 Code, and every connected coding agent"
        actions={<Button variant="outline" size="sm" onClick={() => void loadAgentTime(true)} disabled={loading}>{loading ? <LoaderCircle className="size-3.5 animate-spin" data-icon="inline-start" /> : <RefreshCw className="size-3.5" data-icon="inline-start" />}Refresh</Button>}
      />

      <Card className="mb-6 rounded-lg">
        <CardContent className="grid min-w-0 gap-4 py-4 lg:grid-cols-[180px_minmax(0,240px)_minmax(0,1fr)] lg:items-end">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="agent-range">Date range</Label>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger id="agent-range" data-testid="agentic-range" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="today">Today</SelectItem><SelectItem value="7d">Last 7 days</SelectItem><SelectItem value="30d">Last 30 days</SelectItem><SelectItem value="all">All activity</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-2">
            <Label>Project</Label>
            <Popover open={projectOpen} onOpenChange={setProjectOpen}>
              <PopoverTrigger asChild><Button data-testid="agentic-project-picker" variant="outline" role="combobox" aria-expanded={projectOpen} className="w-full min-w-0 justify-between"><span className="truncate">{project === "all" ? "All projects" : project}</span><ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" /></Button></PopoverTrigger>
              <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-1">
                <Command><CommandInput placeholder="Search Agent Time projects…" /><CommandList><CommandEmpty>No project found.</CommandEmpty><CommandGroup><CommandItem value="All projects" onSelect={() => { setProject("all"); setProjectOpen(false) }}><Check className={`mr-2 size-4 ${project === "all" ? "opacity-100" : "opacity-0"}`} />All projects</CommandItem>{(agentTime?.projects ?? []).map((name) => <CommandItem key={name} value={name} onSelect={() => { setProject(name); setProjectOpen(false) }}><Check className={`mr-2 size-4 ${project === name ? "opacity-100" : "opacity-0"}`} /><span className="truncate">{name}</span></CommandItem>)}</CommandGroup></CommandList></Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="agent-search">Search chats</Label>
            <Input id="agent-search" data-testid="agentic-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, chat ID, model, project…" className="min-w-0" />
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-lg"><CardContent className="p-4"><Clock3 className="mb-3 size-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">Unique coding time</p><p data-testid="agentic-total" className="mt-1 font-mono text-xl font-semibold sm:text-2xl">{formatDuration(totalSeconds)}</p></CardContent></Card>
        <Card className="rounded-lg"><CardContent className="p-4"><MessageSquareText className="mb-3 size-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">Conversations</p><p className="mt-1 font-mono text-xl font-semibold sm:text-2xl">{conversations.length}</p></CardContent></Card>
        <Card className="rounded-lg"><CardContent className="p-4"><FolderKanban className="mb-3 size-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">Projects</p><p className="mt-1 font-mono text-xl font-semibold sm:text-2xl">{visibleProjects}</p></CardContent></Card>
        <Card className="rounded-lg"><CardContent className="p-4"><Sparkles className="mb-3 size-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">Sources</p><p className="mt-1 font-mono text-xl font-semibold sm:text-2xl">{sourceStats.length}</p></CardContent></Card>
      </div>

      <Card className="mb-6 rounded-lg">
        <CardHeader><CardTitle className="text-sm font-medium">By coding source</CardTitle></CardHeader>
        <CardContent className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sourceStats.map((stat) => <button key={stat.label} type="button" data-testid={`agentic-source-${stat.label.toLowerCase().replaceAll(" ", "-")}`} className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/30 ${effectiveSelectedSource === stat.label ? "border-foreground/35 bg-muted/35" : ""}`} onClick={() => setSelectedSource((current) => current === stat.label ? "all" : stat.label)}><SourceLogo label={stat.label} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{stat.label}</span><span className="block font-mono text-xs text-muted-foreground">{formatDuration(stat.seconds)}</span></span><Badge variant="secondary" className="shrink-0 text-[0.65rem]">{stat.conversations}</Badge></button>)}
          {!loading && sourceStats.length === 0 && <p className="text-sm text-muted-foreground">No coding sources match these filters.</p>}
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardTitle className="text-sm font-medium">Master timeline</CardTitle><p className="mt-1 text-xs text-muted-foreground">Overlapping agents count once in the total. Expand any chat for exact contributing spans.</p></div>{effectiveSelectedSource !== "all" && <Button variant="ghost" size="sm" onClick={() => setSelectedSource("all")}>Show all</Button>}</CardHeader>
        <CardContent className="min-w-0 p-0">
          {loading && !agentTime ? <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading agentic coding…</div> : dayGroups.length === 0 ? <div className="px-4 py-12 text-center text-sm text-muted-foreground">No agentic coding matches these filters.</div> : <div className="grid min-w-0 gap-5 p-3 sm:p-4">{dayGroups.map(([date, dayConversations]) => <section key={date} className="min-w-0 overflow-hidden rounded-lg border"><div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2"><div><h2 className="text-sm font-medium">{format(new Date(`${date}T12:00:00`), "EEEE, MMMM d, yyyy")}</h2><p className="text-xs text-muted-foreground">{dayConversations.length} {dayConversations.length === 1 ? "conversation" : "conversations"}</p></div><p className="font-mono text-xs">{formatDuration(unionSeconds(dayConversations.flatMap((conversation) => conversation.spans)))}</p></div><div className="p-3"><DayTimeline conversations={dayConversations} /></div><div>{dayConversations.map((conversation) => <ConversationRow key={conversation.key} conversation={conversation} />)}</div></section>)}</div>}
        </CardContent>
      </Card>
    </>
  )
}
