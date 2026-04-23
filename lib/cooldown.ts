/* =========================
POST-SL COOLDOWN

After a SL hit on a symbol, block new entries on that symbol
for COOLDOWN_MS. Prevents "revenge entries" right after being
stopped out (classic killer for scalpers / intraday traders).

Backed by an in-memory Map keyed on symbol. Resets on cold start,
which is acceptable for typical serverless cycles. If you move
trade persistence to Supabase, consider moving this too so the
cooldown survives restarts.
========================= */

const cooldownMap = new Map<string, number>()

export const DEFAULT_COOLDOWN_MS = 60 * 60_000 // 60 minutes

export function recordStopLossHit(
  symbol: string,
  timestamp: number = Date.now()
): void {
  if (!symbol) return
  cooldownMap.set(symbol, timestamp)
}

export function isSymbolInCooldown(
  symbol: string,
  now: number = Date.now(),
  cooldownMs: number = DEFAULT_COOLDOWN_MS
): boolean {
  const lastSL = cooldownMap.get(symbol)
  if (!lastSL) return false

  return now - lastSL < cooldownMs
}

export function clearCooldown(symbol: string): void {
  cooldownMap.delete(symbol)
}

export function clearAllCooldowns(): void {
  cooldownMap.clear()
}

export function getCooldownRemainingMs(
  symbol: string,
  now: number = Date.now(),
  cooldownMs: number = DEFAULT_COOLDOWN_MS
): number {
  const lastSL = cooldownMap.get(symbol)
  if (!lastSL) return 0

  const elapsed = now - lastSL
  const remaining = cooldownMs - elapsed
  return remaining > 0 ? remaining : 0
}
