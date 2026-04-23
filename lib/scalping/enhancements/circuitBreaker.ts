/* =========================
CIRCUIT BREAKER

Portfolio-level guardrail. Halts signal generation when:
 - Daily P&L <= -3% of starting capital
 - 3 consecutive SL on the same symbol
 - 5 consecutive SL globally

All thresholds are configurable. State is stored in-memory (resets
on cold start, which is fine for daily breakers). Migrate to
Supabase with trade persistence.
========================= */

export type BreakerConfig = {
  /** Fraction of capital. e.g. 0.03 = 3%. */
  dailyMaxLossPct: number
  /** Max consecutive SL on the same symbol before cooldown. */
  consecutiveSlPerSymbol: number
  /** Max consecutive SL globally before halt. */
  consecutiveSlGlobal: number
  /** Halt duration in ms (default 24h). */
  haltDurationMs: number
  /** Symbol cooldown in ms after N SL (default 24h). */
  symbolCooldownMs: number
}

export const DEFAULT_BREAKER_CONFIG: BreakerConfig = {
  dailyMaxLossPct: 0.03,
  consecutiveSlPerSymbol: 3,
  consecutiveSlGlobal: 5,
  haltDurationMs: 24 * 3600 * 1000,
  symbolCooldownMs: 24 * 3600 * 1000
}

type State = {
  dailyPnlPct: number
  dayKey: string
  consecutiveSlGlobal: number
  consecutiveSlBySymbol: Map<string, number>
  symbolCooldownUntil: Map<string, number>
  haltUntil: number | null
}

const state: State = {
  dailyPnlPct: 0,
  dayKey: utcDateKey(new Date()),
  consecutiveSlGlobal: 0,
  consecutiveSlBySymbol: new Map(),
  symbolCooldownUntil: new Map(),
  haltUntil: null
}

function utcDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`
}

function maybeResetDay(now: Date): void {
  const today = utcDateKey(now)
  if (today !== state.dayKey) {
    state.dayKey = today
    state.dailyPnlPct = 0
    // Consecutive counters don't reset on the day change - a losing
    // streak across midnight is still a losing streak.
  }
}

/**
 * Record a closed trade. Updates daily P&L and consecutive streaks.
 * `pnlPct` is fractional of capital, e.g. -0.01 = -1%.
 */
export function recordTradeClose(
  symbol: string,
  pnlPct: number,
  wasSL: boolean,
  config: BreakerConfig = DEFAULT_BREAKER_CONFIG,
  now: Date = new Date()
): void {
  maybeResetDay(now)
  state.dailyPnlPct += pnlPct

  if (wasSL) {
    state.consecutiveSlGlobal += 1
    const currentSymbol = (state.consecutiveSlBySymbol.get(symbol) ?? 0) + 1
    state.consecutiveSlBySymbol.set(symbol, currentSymbol)

    if (currentSymbol >= config.consecutiveSlPerSymbol) {
      state.symbolCooldownUntil.set(symbol, now.getTime() + config.symbolCooldownMs)
    }

    if (state.consecutiveSlGlobal >= config.consecutiveSlGlobal) {
      state.haltUntil = now.getTime() + config.haltDurationMs
    }
  } else {
    // Winning trade resets the streak counters.
    state.consecutiveSlGlobal = 0
    state.consecutiveSlBySymbol.set(symbol, 0)
  }

  // Daily DD breach = immediate halt until end of UTC day + config halt.
  if (state.dailyPnlPct <= -Math.abs(config.dailyMaxLossPct)) {
    const endOfDay = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        0,
        0
      )
    ).getTime()
    state.haltUntil = Math.max(state.haltUntil ?? 0, endOfDay)
  }
}

export type BreakerCheck =
  | { allowed: true }
  | { allowed: false; reason: string; until?: number }

export function checkBreaker(
  symbol: string,
  config: BreakerConfig = DEFAULT_BREAKER_CONFIG,
  now: Date = new Date()
): BreakerCheck {
  maybeResetDay(now)

  if (state.haltUntil && now.getTime() < state.haltUntil) {
    return {
      allowed: false,
      reason: "GLOBAL_HALT",
      until: state.haltUntil
    }
  }

  if (state.dailyPnlPct <= -Math.abs(config.dailyMaxLossPct)) {
    return {
      allowed: false,
      reason: "DAILY_MAX_LOSS_HIT"
    }
  }

  const cooldownUntil = state.symbolCooldownUntil.get(symbol)
  if (cooldownUntil && now.getTime() < cooldownUntil) {
    return {
      allowed: false,
      reason: "SYMBOL_COOLDOWN",
      until: cooldownUntil
    }
  }

  return { allowed: true }
}

export function getBreakerStatus(): {
  dailyPnlPct: number
  consecutiveSlGlobal: number
  consecutiveSlBySymbol: Record<string, number>
  symbolCooldowns: Record<string, number>
  haltUntil: number | null
} {
  const cooldowns: Record<string, number> = {}
  for (const [sym, until] of state.symbolCooldownUntil.entries()) {
    cooldowns[sym] = until
  }
  const streaks: Record<string, number> = {}
  for (const [sym, n] of state.consecutiveSlBySymbol.entries()) {
    streaks[sym] = n
  }

  return {
    dailyPnlPct: state.dailyPnlPct,
    consecutiveSlGlobal: state.consecutiveSlGlobal,
    consecutiveSlBySymbol: streaks,
    symbolCooldowns: cooldowns,
    haltUntil: state.haltUntil
  }
}

export function resetBreaker(): void {
  state.dailyPnlPct = 0
  state.dayKey = utcDateKey(new Date())
  state.consecutiveSlGlobal = 0
  state.consecutiveSlBySymbol.clear()
  state.symbolCooldownUntil.clear()
  state.haltUntil = null
}
