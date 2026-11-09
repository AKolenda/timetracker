"use client"

import { useState } from "react"
import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { Bell, ChevronDown, ClipboardPaste, File, Image as ImageIcon, Info, MessagesSquare, Paperclip, SquareTerminal } from "lucide-react"

import { parseChatMessage, type ChatChip, type ChatChipKind } from "@/lib/chat-context"

// Headings stay close to body size so agent replies full of "## Findings" read as text, not a document.
const heading = "mt-3 mb-1 font-semibold text-foreground first:mt-0"

const components: Components = {
  h1: ({ children }) => <p className={`${heading} text-[0.95rem]`}>{children}</p>,
  h2: ({ children }) => <p className={`${heading} text-[0.95rem]`}>{children}</p>,
  h3: ({ children }) => <p className={heading}>{children}</p>,
  h4: ({ children }) => <p className={heading}>{children}</p>,
  h5: ({ children }) => <p className={heading}>{children}</p>,
  h6: ({ children }) => <p className={heading}>{children}</p>,
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5 [&>ol]:my-1 [&>ul]:my-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-2 hover:no-underline">{children}</a>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 pl-3 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="my-3 border-border" />,
  pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
  code: ({ children }) => <code className="rounded-[4px] bg-muted px-1 py-px font-mono text-[0.85em] text-foreground">{children}</code>,
  table: ({ children }) => <div className="my-2 overflow-x-auto rounded-md border"><table className="w-full border-collapse text-left text-[0.8rem]">{children}</table></div>,
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  tr: ({ children }) => <tr className="border-b last:border-b-0">{children}</tr>,
  th: ({ children }) => <th className="px-2.5 py-1.5 font-medium text-foreground">{children}</th>,
  td: ({ children }) => <td className="px-2.5 py-1.5 align-top">{children}</td>,
  img: ({ alt }) => <span className="text-muted-foreground">[{alt || "image"}]</span>,
}

export function ChatMarkdown({ text }: { text: string }) {
  return <Markdown remarkPlugins={[remarkGfm]} components={components}>{text}</Markdown>
}

const CHIP_ICONS: Record<ChatChipKind, typeof File> = {
  image: ImageIcon,
  thread: MessagesSquare,
  file: File,
  pasted: ClipboardPaste,
  command: SquareTerminal,
  task: Bell,
  note: Info,
  other: Paperclip,
}

function Chip({ chip, open, onToggle }: { chip: ChatChip; open: boolean; onToggle: () => void }) {
  const Icon = CHIP_ICONS[chip.kind]
  const className = "inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
  const content = <><Icon className="size-3 shrink-0" /><span className="truncate">{chip.kind === "thread" ? `Thread · ${chip.label}` : chip.label}</span></>
  if (!chip.detail) return <span className={className} data-testid="chat-chip" title={chip.label}>{content}</span>
  return <button type="button" className={`${className} cursor-pointer hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring`} data-testid="chat-chip" aria-expanded={open} onClick={onToggle}>
    {content}<ChevronDown className={`size-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
  </button>
}

/** A chat message: context, attachments and notices as chips, then the written text as markdown. */
export function ChatMessageBody({ text }: { text: string }) {
  const { body, chips } = parseChatMessage(text)
  const [openChip, setOpenChip] = useState<number | null>(null)
  const detail = openChip !== null ? chips[openChip]?.detail : undefined
  return <>
    {chips.length > 0 && <div className="mb-1.5 flex flex-wrap gap-1.5">
      {chips.map((chip, index) => <Chip key={index} chip={chip} open={openChip === index} onToggle={() => setOpenChip(openChip === index ? null : index)} />)}
    </div>}
    {detail && <pre className="mb-2 max-h-64 overflow-auto rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{detail}</pre>}
    {body && <ChatMarkdown text={body} />}
  </>
}

/** A title without the markdown marks an agent sometimes starts its reply with ("## Findings" → "Findings"). */
export function plainTitle(title: string) {
  return title
    // "[Thread: Set Up New Neon Organization; ref=thread_…]" → "Set Up New Neon Organization"
    .replace(/\[[A-Z][\w ]{0,20}: ([^;\]\n]+); ref=[^\]\s]+\]/g, "$1")
    .replace(/<[a-z_-]+\b[^>]*>/gi, "")
    .replace(/^\s*(#{1,6}\s+|>\s+|[-*+]\s+)/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim()
}
