import type { DataProvider } from "./provider"
import { SupabaseProvider } from "./supabase-provider"
import { supabase } from "../supabase"

export type { DataProvider }

let _provider: DataProvider | null = null

export function getDataProvider(): DataProvider {
  if (_provider) return _provider
  _provider = new SupabaseProvider(supabase)
  return _provider
}
