/* =========================
PER-STRATEGY STATISTICS TRACKER

Tracks the rolling performance of each scalping strategy and auto-
disables any strategy with negative expectancy over the last N trades.

Expectancy = winRate * avgWin - lossRate * avgLoss

The idea: kill bleeding strategies fast, before they drag the
portfolio further down. When a strategy gets auto-disabled, it goes
into a 7-day cooldown, then automatically re-activates so we can
see if the regime changed.

Stored in-memory for now. Migrate to Supabase when trade persistence
is migrated (trades.json -> Supabase table).
========================= */

import type { ScalpStrategyId } from "@/lib/scalping/types"

export type TradeResult = {
  strategy: ScalpStrategyId
  symbol: string
  pnlR: number // P&L in units of initial risk (R-multiple)
  closedAt: number
}

type StrategyRecord = {
  results: TradeResult[]
  disabledUntil: number | null
}

const WINDOW = 30 // rolling trades for expectancy check
const MIN_TRADES_FOR_CHECK = 10
const COOLDOWN_MS = 7 * 24 * 3600 * 1000 // 7 days

const registry = new Map<ScalpStrategyId, StrategyRecord>()

function getRecord(strategy: ScalpStrategyId): StrategyRecord {
  let rec = registry.get(strategy)
  if (!rec) {
    rec = { results: [], disabledUntil: null }
    registry.set(strategy, rec)
  }
  return rec
}

export function recordTradeResult(result: TradeResult): void {
  const rec = getRecord(result.strategy)
  rec.results.push(result)
  if (rec.results.length > 200) {
    rec.results = rec.results.slice(-200) // cap memory
  }

  maybeAutoDisable(result.strategy)
}

function maybeAutoDisable(strategy: ScalpStrategyId): void {
  const rec = getRecord(strategy)
  const window = rec.results.slice(-WINDOW)
  if (window.length < MIN_TRADES_FOR_CHECK) return

  const wins = window.filter((r) => r.pnlR > 0)
  const losses = window.filter((r) => r.pnlR < 0)

  if (!wins.length || !losses.length) return

  const winRate = wins.length / window.length
  const lossRate = losses.length / window.length
  const avgWin = wins.reduce((s, r) => s + r.pnlR, 0) / wins.length
  const avgLoss = Math.abs(losses.reduce((s, r) => s + r.pnlR, 0) / losses.length)
  const expectancy = winRate * avgWin - lossRate * avgLoss

  if (expectancy < 0) {
    rec.disabledUntil = Date.now() + COOLDOWN_MS
  }
}

export function isStrategyEnabled(
  strategy: ScalpStrategyId,
  now: number = Date.now()
): boolean {
  const rec = getRecord(strategy)
  if (!rec.disabledUntil) return true
  if (now >= rec.disabledUntil) {
    // Cooldown expired - re-enable.
    rec.disabledUntil = null
    return true
  }
  return false
}

export function getStrategyStats(strategy: ScalpStrategyId): {
  trades: number
  winRate: number
  avgWin: number
  avgLoss: number
  expectancy: number
  enabled: boolean
  disabledUntil: number | null
} {
  const rec = getRecord(strategy)
  const window = rec.results.slice(-WINDOW)
  const wins = window.filter((r) => r.pnlR > 0)
  const losses = window.filter((r) => r.pnlR < 0)

  const winRate = window.length > 0 ? wins.length / window.length : 0
  const avgWin = wins.length > 0 ? wins.reduce((s, r) => s + r.pnlR, 0) / wins.length : 0
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, r) => s + r.pnlR, 0) / losses.length) : 0
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss

  return {
    trades: window.length,
    winRate,
    avgWin,
    avgLoss,
    expectancy,
    enabled: isStrategyEnabled(strategy),
    disabledUntil: rec.disabledUntil
  }
}

export function manualEnableStrategy(strategy: ScalpStrategyId): void {
  const rec = getRecord(strategy)
  rec.disabledUntil = null
}

export function clearAllStats(): void {
  registry.clear()
}
