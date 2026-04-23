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

/**
 * The EURUSD VWAP pullback strategy was evaluated across v1-v7 calibrations
 * and consistently produced negative expectancy on 5m scalps:
 *
 *   v7 sample: 5 trades, 20% winrate, MFE p50 = 0.35R.
 *
 * The pullbacks touch VWAP/EMA21 but reversals are weak - price dies after
 * 0.3-0.4R favorable excursion. This isn't a calibration issue, it's a
 * fundamental mismatch between the concept and the 5m timeframe on EURUSD
 * in the current regime.
 *
 * Disabled until either:
 *   - a new EUR strategy concept is designed, or
 *   - the timeframe is moved to 15m / 30m where pullbacks run further.
 *
 * To re-enable for experimentation, flip ENABLE_EURUSD_STRATEGY to true.
 */
const ENABLE_EURUSD_STRATEGY = false

/**
 * BTCUSDT breakout+retest evaluated on a 5000-bar (17 days) backtest:
 *   51 trades, 52.9% winrate, +0.49R avg win, -1.00R avg loss
 *   Real expectancy: -0.033R per trade (cumulative -1.68R)
 *   Profit factor: 0.89 (slightly negative edge)
 *
 * Statistically meaningful sample (51 trades, decent confidence interval),
 * and the result is "no edge". Not enough TPs hit because BTC 5m moves
 * past 0.5R only 53% of the time but losses are full -1R.
 *
 * Disabled to avoid bleeding on a non-edge strategy. Could be revisited
 * with a different concept (e.g. pullback in trend on 15m, or order-block
 * reversion).
 */
const ENABLE_BTCUSDT_STRATEGY = false

const STRATEGY_REGISTRY: StrategyDescriptor[] = [
  ...(ENABLE_BTCUSDT_STRATEGY
    ? [
        {
          id: "BTC_BREAKOUT_RETEST" as const,
          symbols: ["BTCUSDT"],
          run: runBtcBreakoutRetest
        }
      ]
    : []),
  ...(ENABLE_EURUSD_STRATEGY
    ? [
        {
          id: "EURUSD_VWAP_PULLBACK" as const,
          symbols: ["EURUSD", "GBPUSD"],
          run: runEurusdVwapPullback
        }
      ]
    : []),
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
