/* =========================
SCALPING ORCHESTRATOR

Single entry point that:
 1. Fetches candle context for each enabled scalping asset (BTC/EUR/XAU).
 2. Runs the matching strategy.
 3. Applies enhancements (news blackout, circuit breaker, stats gate,
    adaptive RR).
 4. Returns validated ScalpSignal[] ready to be published.

Called by the API route /api/scalping/scan.
========================= */

import type { Candle } from "@/lib/providers"
import type { ScalpSignal, ScalpStrategyId } from "@/lib/scalping/types"
import { runBtcBreakoutRetest } from "@/lib/scalping/strategies/btcBreakoutRetest"
import { runEurusdVwapPullback } from "@/lib/scalping/strategies/eurusdVwapPullback"
import { runXauusdLiquiditySweep } from "@/lib/scalping/strategies/xauusdLiquiditySweep"

import { applyAdaptiveRR } from "@/lib/scalping/enhancements/adaptiveRR"
import { isStrategyEnabled } from "@/lib/scalping/enhancements/strategyStats"
import { checkBreaker } from "@/lib/scalping/enhancements/circuitBreaker"
import {
  checkNewsBlackout,
  checkNewsBlackoutFresh
} from "@/lib/scalping/enhancements/newsBlackout"
import { getMacroNews } from "@/lib/macroNews"
import type { MacroEvent } from "@/lib/macroNews"

export type ScalpContext = {
  symbol: string
  candles1h: Candle[]
  candles15m: Candle[]
  candles5m: Candle[]
}

export type ScalpRunResult = {
  signals: ScalpSignal[]
  skipped: {
    symbol: string
    reason: string
    details?: string
  }[]
  meta: {
    totalConsidered: number
    generatedAt: number
  }
}

type StrategyDescriptor = {
  id: ScalpStrategyId
  symbols: string[]
  run: (
    symbol: string,
    candles1h: Candle[],
    candles15m: Candle[],
    candles5m: Candle[],
    now?: Date
  ) => ScalpSignal | null
}

const STRATEGY_REGISTRY: StrategyDescriptor[] = [
  {
    id: "BTC_BREAKOUT_RETEST",
    symbols: ["BTCUSDT"],
    run: runBtcBreakoutRetest
  },
  {
    id: "EURUSD_VWAP_PULLBACK",
    symbols: ["EURUSD", "GBPUSD"],
    run: runEurusdVwapPullback
  },
  {
    id: "XAUUSD_LIQUIDITY_SWEEP",
    symbols: ["XAUUSD", "XAUUSDT"],
    run: runXauusdLiquiditySweep
  }
]

function findStrategy(symbol: string): StrategyDescriptor | null {
  return STRATEGY_REGISTRY.find((s) => s.symbols.includes(symbol)) ?? null
}

export async function runScalpingPipeline(
  contexts: ScalpContext[],
  now: Date = new Date()
): Promise<ScalpRunResult> {
  const signals: ScalpSignal[] = []
  const skipped: ScalpRunResult["skipped"] = []

  // Fetch macro events ONCE for the whole batch.
  let macroEvents: MacroEvent[] = []
  try {
    macroEvents = await getMacroNews()
  } catch {
    macroEvents = []
  }

  for (const ctx of contexts) {
    const strategy = findStrategy(ctx.symbol)
    if (!strategy) {
      skipped.push({ symbol: ctx.symbol, reason: "NO_STRATEGY_FOR_SYMBOL" })
      continue
    }

    if (!isStrategyEnabled(strategy.id)) {
      skipped.push({ symbol: ctx.symbol, reason: "STRATEGY_AUTO_DISABLED" })
      continue
    }

    // Circuit breaker - checked before running the (expensive) strategy.
    const breaker = checkBreaker(ctx.symbol, undefined, now)
    if (!breaker.allowed) {
      skipped.push({
        symbol: ctx.symbol,
        reason: `CIRCUIT_${breaker.reason}`,
        details: breaker.until ? `until=${new Date(breaker.until).toISOString()}` : undefined
      })
      continue
    }

    // News blackout - also cheap.
    const news = checkNewsBlackout(ctx.symbol, macroEvents, now)
    if (news.blocked) {
      skipped.push({
        symbol: ctx.symbol,
        reason: "NEWS_BLACKOUT",
        details: `${news.event.event} (${news.minutesFromEvent.toFixed(1)} min)`
      })
      continue
    }

    // Run the strategy.
    const raw = strategy.run(
      ctx.symbol,
      ctx.candles1h,
      ctx.candles15m,
      ctx.candles5m,
      now
    )
    if (!raw) {
      skipped.push({ symbol: ctx.symbol, reason: "NO_SETUP" })
      continue
    }

    // Apply adaptive RR.
    const adjusted = applyAdaptiveRR(raw)
    signals.push(adjusted)
  }

  return {
    signals,
    skipped,
    meta: {
      totalConsidered: contexts.length,
      generatedAt: now.getTime()
    }
  }
}

export function listRegisteredStrategies(): StrategyDescriptor[] {
  return STRATEGY_REGISTRY
}

export { checkNewsBlackoutFresh }
