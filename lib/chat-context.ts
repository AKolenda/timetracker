// Turns the wrappers agents and T3 Code put around a message (context blocks, attachment refs,
// pasted text, command and task notices) into chips, leaving only what the person wrote.

export type ChatChipKind = "image" | "thread" | "file" | "pasted" | "command" | "task" | "note" | "other"

export interface ChatChip {
  kind: ChatChipKind
  label: string
  /** Text shown when the chip is expanded, such as pasted content or command output. */
  detail?: string
}

export interface ParsedChatMessage {
  body: string
  chips: ChatChip[]
}

const KINDS: Record<string, ChatChipKind> = { image: "image", thread: "thread", file: "file", files: "file", attachment: "file" }

function field(block: string, name: string) {
  return block.match(new RegExp(`^\\s*${name}:\\s*(.+)$`, "m"))?.[1]?.trim()
}

function tagValue(block: string, name: string) {
  return block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim()
}

export function parseChatMessage(text: string): ParsedChatMessage {
  const chips: ChatChip[] = []
  const ids = new Set<string>()
  const add = (chip: ChatChip, id?: string) => {
    if (id) {
      if (ids.has(id)) return
      ids.add(id)
    }
    chips.push(chip)
  }
  let body = text

  // <task-notification>…<summary>…</summary>…</task-notification>
  body = body.replace(/<task-notification>([\s\S]*?)<\/task-notification>/g, (_, block: string) => {
    const summary = tagValue(block, "summary") || "Background task update"
    const status = tagValue(block, "status")
    add({ kind: "task", label: status ? `${summary} · ${status}` : summary })
    return ""
  })

  // <t3_context version="1"><context kind="image" id="…">name: …</context>…</t3_context>
  body = body.replace(/<t3_context\b[^>]*>([\s\S]*?)<\/t3_context>/g, (_, inner: string) => {
    for (const match of inner.matchAll(/<context\b([^>]*)>([\s\S]*?)<\/context>/g)) {
      const attrs = match[1]
      const kind = attrs.match(/kind="([^"]+)"/)?.[1] ?? "other"
      const id = attrs.match(/id="([^"]+)"/)?.[1]
      const label = field(match[2], "title") || field(match[2], "name") || field(match[2], "path") || kind
      add({ kind: KINDS[kind] ?? "other", label }, id)
    }
    return ""
  })

  // Inline refs such as "[Image: image.png; ref=image_…]" or "[Thread: Title; ref=thread_…]".
  body = body.replace(/\[([A-Z][\w ]{0,20}): ([^;\]\n]+); ref=([^\]\s]+)\]/g, (_, kind: string, label: string, ref: string) => {
    add({ kind: KINDS[kind.toLowerCase()] ?? "other", label: label.trim() }, ref)
    return ""
  })

  // <pasted_content id="…">…</pasted_content>
  body = body.replace(/<pasted_content\b[^>]*>([\s\S]*?)<\/pasted_content>/g, (_, inner: string) => {
    const pasted = inner.trim()
    const lines = pasted ? pasted.split("\n").length : 0
    add({ kind: "pasted", label: `Pasted text · ${lines} ${lines === 1 ? "line" : "lines"}`, detail: pasted })
    return ""
  })

  // Slash commands: <command-name>/compact</command-name><command-message>…</command-message><command-args>…</command-args>
  body = body.replace(/<command-name>([\s\S]*?)<\/command-name>/g, (_, name: string) => {
    add({ kind: "command", label: name.trim() })
    return ""
  })
  body = body.replace(/<command-message>[\s\S]*?<\/command-message>/g, "")
  body = body.replace(/<command-args>([\s\S]*?)<\/command-args>/g, (_, args: string) => args.trim())
  body = body.replace(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/g, (_, out: string) => {
    if (out.trim()) add({ kind: "command", label: "Command output", detail: out.trim() })
    return ""
  })
  body = body.replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, "")

  // Notes the harness adds for the agent, not something the person wrote.
  body = body.replace(/<system-reminder>([\s\S]*?)<\/system-reminder>/g, (_, inner: string) => {
    add({ kind: "note", label: "System note", detail: inner.trim() })
    return ""
  })

  body = body.replace(/(\S)[ \t]{2,}/g, "$1 ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  return { body, chips }
}
