"use client"

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { ArrowUp, Check, ChevronRight, Loader2, Sparkles, Square, SquarePen, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChatMarkdown } from "@/components/chat-markdown"
import { cn } from "@/lib/utils"
import { describeProposal, type ChatEntry, type ChatStep, type ChatStreamEvent, type ChatSuggestion, type ChatTurn, type InvoiceProposal } from "@/lib/invoice-chat"

/**
 * The invoice preview's AI chat, laid out like NovaPro's assistant: the person's messages in
 * bubbles, each reply's work folded into one "Worked for 12s" row above a plain answer, a
 * change card to apply or discard, and follow-ups under the last reply. Sending never blocks
 * the preview; Stop cancels the reply.
 */

export type ProposalState = "pending" | "applying" | "applied" | "undone" | "discarded" | "replaced"
export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | {
      id: string
      role: "assistant"
      startedAt: number
      endedAt?: number
      steps: ChatStep[]
      reply?: string
      suggestions?: ChatSuggestion[]
      proposal?: InvoiceProposal | null
      proposalState?: ProposalState
      error?: string
    }
type Reply = Extract<ChatMessage, { role: "assistant" }>

export type ProposalImpact = { linesBefore: number; linesAfter: number; totalBefore: string; totalAfter: string }

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()))

const STATE_LABEL: Partial<Record<ProposalState, [string, string]>> = {
  applied: ["Applied", "text-success-foreground"],
  undone: ["Undone", "text-muted-foreground"],
  discarded: ["Discarded", "text-muted-foreground"],
  replaced: ["Replaced", "text-muted-foreground"],
}

/** What the model reads back: replies, plus whether each proposal was applied. */
function toTurns(messages: ChatMessage[]): ChatTurn[] {
  return messages.flatMap((message): ChatTurn[] => {
    if (message.role === "user") return [{ role: "user", text: message.text }]
    if (!message.reply) return []
    const outcome = message.proposal ? `\n[Proposed "${message.proposal.title}": ${message.proposalState === "applied" ? "applied" : message.proposalState === "pending" ? "not applied yet" : "not applied"}]` : ""
    return [{ role: "assistant", text: message.reply + outcome }]
  })
}

function seconds(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function WorkFold({ message, now }: { message: Reply; now: number }) {
  const live = !message.endedAt
  const failed = !live && Boolean(message.error)
  const [open, setOpen] = useState<boolean | null>(null)
  const expanded = open ?? live
  const elapsed = (message.endedAt ?? now) - message.startedAt
  return (
    <div data-work-fold className="min-w-0 rounded-xl border bg-card text-[13px]">
      <button type="button" aria-expanded={expanded} onClick={() => setOpen(!expanded)} className="flex min-h-9 w-full items-center gap-2 rounded-xl px-2.5 text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:min-h-11">
        {live ? <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden /> : failed ? <X className="size-3.5 shrink-0 text-destructive" aria-hidden /> : <Check className="size-3.5 shrink-0 text-success-foreground" aria-hidden />}
        <span className="min-w-0 flex-1 truncate">{live ? "Working" : failed ? `Stopped after ${seconds(elapsed)}` : `Worked for ${seconds(elapsed)}`}</span>
        {live && <span className="shrink-0 text-xs tabular-nums">{seconds(elapsed)}</span>}
        <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 transition-transform motion-reduce:transition-none", expanded && "rotate-90")} />
      </button>
      {expanded && message.steps.length > 0 && (
        <ol className="space-y-0.5 border-t px-2.5 py-1.5">
          {message.steps.map((step) => (
            <li key={step.id} className="flex min-h-7 items-center gap-2">
              {step.status === "running" ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-label="In progress" /> : step.status === "failed" ? <X className="size-3.5 shrink-0 text-destructive" aria-label="Failed" /> : <Check className="size-3.5 shrink-0 text-success-foreground" aria-label="Done" />}
              <span className={cn("min-w-0 flex-1 truncate", step.status === "running" && "animate-pulse")}>{step.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{step.status === "running" ? seconds(now - message.startedAt) : step.ms ? seconds(step.ms) : ""}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function ProposalCard({ message, impact, onApply, onDiscard, onReview, onUndo, canUndo }: {
  message: Reply
  impact: ProposalImpact | null
  onApply: () => void
  onDiscard: () => void
  onReview: () => void
  onUndo: () => void
  canUndo: boolean
}) {
  const proposal = message.proposal!
  const state = message.proposalState ?? "pending"
  const label = STATE_LABEL[state]
  const changes = describeProposal(proposal)
  return (
    <article aria-label={proposal.title} className="min-w-0 rounded-xl border bg-card text-[13px]">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <p className="min-w-0 flex-1 font-medium break-words">{proposal.title}</p>
        {label && <span className={cn("shrink-0 text-xs", label[1])}>{label[0]}</span>}
      </div>
      <ul className="space-y-0.5 px-3 py-2">
        {changes.map((change) => <li key={change} className={cn("break-words", change.startsWith("Delete") && "text-destructive")}>{change}</li>)}
      </ul>
      {impact && state !== "applied" && (
        <dl className="flex flex-wrap gap-x-4 gap-y-0.5 px-3 pb-2 text-xs text-muted-foreground tabular-nums">
          <div className="flex gap-1"><dt>Lines</dt><dd className="text-foreground">{impact.linesBefore} → {impact.linesAfter}</dd></div>
          <div className="flex gap-1"><dt>Total</dt><dd className="text-foreground">{impact.totalBefore === impact.totalAfter ? `${impact.totalAfter}, unchanged` : `${impact.totalBefore} → ${impact.totalAfter}`}</dd></div>
        </dl>
      )}
      {(state === "pending" || state === "applying") && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-3 py-2">
          <Button type="button" variant="ghost" size="sm" disabled={state === "applying"} onClick={onDiscard}>Discard</Button>
          <Button type="button" variant="outline" size="sm" className="md:hidden" onClick={onReview}>Review</Button>
          <Button type="button" size="sm" disabled={state === "applying"} onClick={onApply}>{state === "applying" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}Apply</Button>
        </div>
      )}
      {state === "applied" && canUndo && (
        <div className="flex justify-end border-t px-3 py-1.5"><Button type="button" variant="ghost" size="sm" onClick={onUndo}>Undo</Button></div>
      )}
    </article>
  )
}

function Suggestions({ suggestions, onPrompt, disabled }: { suggestions: ChatSuggestion[]; onPrompt: (prompt: string) => void; disabled?: boolean }) {
  if (!suggestions.length) return null
  return (
    <div role="group" aria-label="Suggested next steps" className="flex min-w-0 flex-wrap gap-1.5">
      {suggestions.map((suggestion) => (
        <Button key={suggestion.label} type="button" variant="outline" size="sm" disabled={disabled} className="h-7 max-w-full text-xs" onClick={() => onPrompt(suggestion.prompt)}>
          <span className="min-w-0 truncate">{suggestion.label}</span>
        </Button>
      ))}
    </div>
  )
}

export function InvoiceChat({ clientName, currency, entries, messages, onMessages, starters, impact, onApply, onUndo, onReview, undoable, className }: {
  clientName: string
  currency: string
  entries: ChatEntry[]
  messages: ChatMessage[]
  onMessages: (update: (messages: ChatMessage[]) => ChatMessage[]) => void
  starters: ChatSuggestion[]
  impact: (proposal: InvoiceProposal) => ProposalImpact | null
  onApply: (messageId: string, proposal: InvoiceProposal) => Promise<boolean>
  onUndo: (messageId: string) => void
  onReview: () => void
  undoable: (messageId: string) => boolean
  className?: string
}) {
  const [draft, setDraft] = useState("")
  const [now, setNow] = useState(() => Date.now())
  const abort = useRef<AbortController | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const running = messages.some((message) => message.role === "assistant" && !message.endedAt)
  const patch = (id: string, update: (message: Reply) => Reply) => onMessages((list) => list.map((message) => (message.id === id && message.role === "assistant" ? update(message) : message)))

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => {
    const box = scroller.current
    if (box) box.scrollTop = box.scrollHeight
  }, [messages.length, running])

  async function send(text: string) {
    const message = text.trim()
    if (!message || running) return
    const user: ChatMessage = { id: newId(), role: "user", text: message }
    const reply: Reply = { id: newId(), role: "assistant", startedAt: Date.now(), steps: [] }
    const turns = toTurns([...messages, user])
    setDraft("")
    setNow(Date.now())
    onMessages((list) => [...list, user, reply])
    const controller = new AbortController()
    abort.current = controller
    const finish = (update: Partial<Reply>) => patch(reply.id, (current) => ({ ...current, endedAt: Date.now(), steps: current.steps.map((step) => (step.status === "running" ? { ...step, status: "failed" } : step)), ...update }))
    try {
      const response = await fetch("/api/invoice-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, currency, today: new Date().toLocaleDateString("en-CA"), entries, turns }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null)
        return finish({ error: body?.error || "The AI didn't answer. Try again." })
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let answered = false
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newline = buffer.indexOf("\n")
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          newline = buffer.indexOf("\n")
          if (!line) continue
          const event = JSON.parse(line) as ChatStreamEvent
          if (event.type === "step") patch(reply.id, (current) => ({ ...current, steps: current.steps.some((step) => step.id === event.step.id) ? current.steps.map((step) => (step.id === event.step.id ? event.step : step)) : [...current.steps, event.step] }))
          else if (event.type === "error") { answered = true; finish({ error: event.message }) }
          else if (event.type === "answer") {
            answered = true
            const { reply: answer, proposal, suggestions } = event.answer
            // A new proposal replaces any still waiting, so only one change is ever pending.
            onMessages((list) => list.map((item) => (proposal && item.role === "assistant" && item.id !== reply.id && item.proposalState === "pending" ? { ...item, proposalState: "replaced" } : item)))
            finish({ reply: answer, proposal, suggestions, proposalState: proposal ? "pending" : undefined })
          }
        }
      }
      if (!answered) finish({ error: "The reply was cut off. Try again." })
    } catch (error) {
      finish({ error: controller.signal.aborted ? "Stopped." : error instanceof Error ? error.message : "The AI didn't answer." })
    } finally {
      if (abort.current === controller) abort.current = null
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void send(draft)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send(draft)
    }
  }

  const lastReply = [...messages].reverse().find((message): message is Reply => message.role === "assistant")

  return (
    <section aria-label="Ask AI about this invoice" className={cn("flex min-h-0 flex-col", className)}>
      {/* On phones the dialog's "Ask AI" tab is the title and holds New chat. */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4 max-md:hidden">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">Ask AI</h3>
        {messages.length > 0 && <Button type="button" variant="ghost" size="icon-sm" className="pointer-coarse:size-11" aria-label="New chat" title="New chat" disabled={running} onClick={() => onMessages(() => [])}><SquarePen /></Button>}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted-foreground">Ask to combine, rename, discount or delete these entries. You review every change before it&apos;s applied.</p>
            <Suggestions suggestions={starters} onPrompt={(prompt) => void send(prompt)} />
          </div>
        )}
        {messages.map((message) => message.role === "user" ? (
          <p key={message.id} data-user-message className="ml-auto w-fit max-w-[88%] rounded-xl rounded-br-sm border bg-muted px-3 py-2.5 text-[13px] leading-5 break-words whitespace-pre-wrap">{message.text}</p>
        ) : (
          <article key={message.id} data-assistant-response className="min-w-0 space-y-2.5">
            <WorkFold message={message} now={now} />
            {message.reply && <div className="min-w-0 px-0.5 text-[13px] leading-relaxed"><ChatMarkdown text={message.reply} /></div>}
            {message.error && (
              <p role="alert" className="flex flex-wrap items-center gap-2 px-0.5 text-[13px] text-destructive">
                {message.error}
              </p>
            )}
            {message.proposal && (
              <ProposalCard
                message={message}
                impact={impact(message.proposal)}
                canUndo={undoable(message.id)}
                onReview={onReview}
                onDiscard={() => patch(message.id, (current) => ({ ...current, proposalState: "discarded" }))}
                onUndo={() => onUndo(message.id)}
                onApply={async () => {
                  patch(message.id, (current) => ({ ...current, proposalState: "applying" }))
                  const ok = await onApply(message.id, message.proposal!)
                  patch(message.id, (current) => ({ ...current, proposalState: ok ? "applied" : "pending" }))
                }}
              />
            )}
            {message === lastReply && message.endedAt && <Suggestions suggestions={message.suggestions ?? []} disabled={running} onPrompt={(prompt) => void send(prompt)} />}
          </article>
        ))}
      </div>
      <form onSubmit={submit} className="shrink-0 border-t p-2.5">
        <div className="rounded-xl border bg-muted/70 p-2 focus-within:ring-2 focus-within:ring-ring/50">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            aria-label="Message"
            placeholder="e.g. one line per day, and drop anything under 2 minutes"
            className="block max-h-40 min-h-10 w-full resize-none bg-transparent px-1 text-[13px] leading-5 outline-none placeholder:text-muted-foreground max-sm:text-base"
          />
          <div className="mt-1 flex items-center justify-end gap-1">
            {running
              ? <Button type="button" size="icon-sm" variant="secondary" className="pointer-coarse:size-11" aria-label="Stop" title="Stop" onClick={() => abort.current?.abort()}><Square className="fill-current" /></Button>
              : <Button type="submit" size="icon-sm" className="pointer-coarse:size-11" aria-label="Send" title="Send" disabled={!draft.trim()}><ArrowUp /></Button>}
          </div>
        </div>
      </form>
    </section>
  )
}
