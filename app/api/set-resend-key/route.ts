import { NextResponse } from "next/server"
import { writeFile, readFile } from "fs/promises"
import { join } from "path"

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

  return NextResponse.json({ success: true })
}
