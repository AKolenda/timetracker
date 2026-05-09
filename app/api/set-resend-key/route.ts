import { NextResponse } from "next/server"
import { writeFile, readFile } from "fs/promises"
import { join } from "path"

export async function GET() {
  const configured = Boolean(process.env.RESEND_API_KEY)
  let masked: string | null = null
  if (configured && process.env.RESEND_API_KEY) {
    const k = process.env.RESEND_API_KEY
    masked = k.length > 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : "re_…"
  }
  return NextResponse.json({ configured, masked })
}

export async function DELETE() {
  const envPath = join(process.cwd(), ".env.local")
  let content = ""
  try {
    content = await readFile(envPath, "utf-8")
  } catch {}
  const lines = content.split("\n").filter((l) => !l.startsWith("RESEND_API_KEY="))
  await writeFile(envPath, lines.filter(Boolean).join("\n") + (lines.length ? "\n" : ""), "utf-8")
  delete process.env.RESEND_API_KEY
  return NextResponse.json({ success: true })
}

export async function POST(request: Request) {
  const { key } = await request.json()
  if (!key || typeof key !== "string" || !key.startsWith("re_")) {
    return NextResponse.json(
      { error: "Invalid Resend API key format" },
      { status: 400 }
    )
  }

  const envPath = join(process.cwd(), ".env.local")
  let content = ""
  try {
    content = await readFile(envPath, "utf-8")
  } catch {}

  const lines = content.split("\n").filter((l) => !l.startsWith("RESEND_API_KEY="))
  lines.push(`RESEND_API_KEY=${key}`)

  await writeFile(envPath, lines.filter(Boolean).join("\n") + "\n", "utf-8")
  process.env.RESEND_API_KEY = key

  return NextResponse.json({ success: true })
}
