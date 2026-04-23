/* =========================
BACKTEST RUNNER

Replays historical candles and simulates the scalping pipeline to
measure expectancy, winrate, profit factor, and max drawdown.

Simple model:
 - Walk the 5m candles one by one.
 - At each bar, slice the history into (1h / 15m / 5m) contexts.
 - Run the strategy, capture any signal.
 - If a signal fires, simulate the trade on subsequent 5m bars:
    * TP hit (high >= tp for long, low <= tp for short) = +rr
    * SL hit (low <= sl for long, high >= sl for short) = -1
    * Break-even triggered: SL moves to entry. Subsequent SL hit = 0
    * If neither after N bars (timeout) = close at market, compute R
 - Aggregate stats.

This does NOT simulate slippage, spread, overnight fees, or news
impact - those are real-world frictions the live system already
guards against. It's meant to give you a first-order approximation
of the strategy's edge.
========================= */

import type { Candle } from "@/lib/providers"
import type { ScalpSignal } from "@/lib/scalping/types"
import type { CandleWithTime } from "@/lib/scalping/shared/volumeProfile"
import {
  runBtcBreakoutRetest,
  runBtcBreakoutRetestDebug
} from "@/lib/scalping/strategies/btcBreakoutRetest"
import {
  runEurusdVwapPullback,
  runEurusdVwapPullbackDebug
} from "@/lib/scalping/strategies/eurusdVwapPullback"
import {
  runXauusdLiquiditySweep,
  runXauusdLiquiditySweepDebug
} from "@/lib/scalping/strategies/xauusdLiquiditySweep"
import { applyAdaptiveRR } from "@/lib/scalping/enhancements/adaptiveRR"

export type BacktestTrade = {
  signal: ScalpSignal
  closedAt: number
  pnlR: number
  closeReason: "TP" | "SL" | "BE_STOP" | "TIMEOUT"
  barsHeld: number
}

export type BacktestResult = {
  symbol: string
  strategyId: string
  trades: BacktestTrade[]
  totalTrades: number
  wins: number
  losses: number
  breakEven: number
  winRate: number
  avgWinR: number
  avgLossR: number
  expectancyR: number
  profitFactor: number
  maxDrawdownR: number
  cumulativeR: number
}

const BAR_TIMEOUT = 24 // 24 * 5m = 2 hours for scalps

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function pickStrategyRunner(symbol: string) {
  if (symbol === "BTCUSDT") return runBtcBreakoutRetest
  if (symbol === "EURUSD" || symbol === "GBPUSD") return runEurusdVwapPullback
  if (symbol === "XAUUSD" || symbol === "XAUUSDT") return runXauusdLiquiditySweep
  return null
}

type StrategyDebugRunner = (
  symbol: string,
  candles1h: CandleWithTime[],
  candles15m: CandleWithTime[],
  candles5m: CandleWithTime[],
  now?: Date
) => {
  signal: ScalpSignal | null
  passed: boolean
  confidence: number
  failedGates: string[]
  prefligthFailed?: string
}

function pickDebugRunner(symbol: string): StrategyDebugRunner | null {
  if (symbol === "BTCUSDT") return runBtcBreakoutRetestDebug as StrategyDebugRunner
  if (symbol === "EURUSD" || symbol === "GBPUSD") return runEurusdVwapPullbackDebug as StrategyDebugRunner
  if (symbol === "XAUUSD" || symbol === "XAUUSDT") return runXauusdLiquiditySweepDebug as StrategyDebugRunner
  return null
}

/**
 * Simulate the outcome of a single signal starting at `startIdx`.
 * Returns the resulting trade record.
 */
function simulateTrade(
  signal: ScalpSignal,
  futureBars5m: CandleWithTime[],
  startIdx: number
): BacktestTrade {
  const initialRisk = Math.abs(signal.entry - signal.sl)
  let activeSl = signal.sl
  let beApplied = false
  const end = Math.min(startIdx + BAR_TIMEOUT, futureBars5m.length)

  for (let i = startIdx; i < end; i++) {
    const bar = futureBars5m[i]
    const h = safeNumber(bar.high)
    const l = safeNumber(bar.low)

    if (signal.direction === "BUY") {
      // Check SL/BE first - conservative ordering.
      if (l <= activeSl) {
        const closePrice = activeSl
        const pnlR = (closePrice - signal.entry) / initialRisk
        return {
          signal,
          closedAt: bar.openTime ?? i,
          pnlR,
          closeReason: beApplied && activeSl === signal.entry ? "BE_STOP" : "SL",
          barsHeld: i - startIdx + 1
        }
      }
      if (h >= signal.tp) {
        const pnlR = (signal.tp - signal.entry) / initialRisk
        return {
          signal,
          closedAt: bar.openTime ?? i,
          pnlR,
          closeReason: "TP",
          barsHeld: i - startIdx + 1
        }
      }
      if (!beApplied && h >= signal.breakEvenTrigger) {
        activeSl = signal.entry
        beApplied = true
      }
    } else {
      if (h >= activeSl) {
        const closePrice = activeSl
        const pnlR = (signal.entry - closePrice) / initialRisk
        return {
          signal,
          closedAt: bar.openTime ?? i,
          pnlR,
          closeReason: beApplied && activeSl === signal.entry ? "BE_STOP" : "SL",
          barsHeld: i - startIdx + 1
        }
      }
      if (l <= signal.tp) {
        const pnlR = (signal.entry - signal.tp) / initialRisk
        return {
          signal,
          closedAt: bar.openTime ?? i,
          pnlR,
          closeReason: "TP",
          barsHeld: i - startIdx + 1
        }
      }
      if (!beApplied && l <= signal.breakEvenTrigger) {
        activeSl = signal.entry
        beApplied = true
      }
    }
  }

  // Timeout - close at the last close of the simulation window.
  const lastBar = futureBars5m[end - 1]
  const lastClose = safeNumber(lastBar?.close)
  const pnlR =
    signal.direction === "BUY"
      ? (lastClose - signal.entry) / initialRisk
      : (signal.entry - lastClose) / initialRisk

  return {
    signal,
    closedAt: lastBar?.openTime ?? end,
    pnlR,
    closeReason: "TIMEOUT",
    barsHeld: end - startIdx
  }
}

/**
 * Run a full backtest on a dataset. The caller provides aligned
 * 1h/15m/5m candle arrays covering the full period, and we walk
 * the 5m stream bar-by-bar.
 *
 *   startOffset - how many bars of warm-up to skip before evaluating.
 *   cooldownBars - prevent overlapping trades on the same symbol.
 */
export function runBacktest(
  symbol: string,
  candles1h: CandleWithTime[],
  candles15m: CandleWithTime[],
  candles5m: CandleWithTime[],
  options: {
    startOffset?: number
    cooldownBars?: number
  } = {}
): BacktestResult {
  const { startOffset = 80, cooldownBars = 12 } = options

  const runner = pickStrategyRunner(symbol)
  const trades: BacktestTrade[] = []

  if (!runner) {
    return emptyResult(symbol, "UNKNOWN")
  }

  let skipUntil = 0

  for (let i = startOffset; i < candles5m.length - 1; i++) {
    if (i < skipUntil) continue

    const bar = candles5m[i]
    const now = bar.openTime ? new Date(bar.openTime) : new Date()

    // Align context slices: use only data available at bar i (no look-ahead).
    const history5m = candles5m.slice(0, i + 1)

    // For HTF slices, find the last 1h / 15m candle whose openTime <= bar.openTime.
    const alignTime = bar.openTime ?? Number.POSITIVE_INFINITY
    const history1h = candles1h.filter(
      (c) => (c.openTime ?? 0) <= alignTime
    )
    const history15m = candles15m.filter(
      (c) => (c.openTime ?? 0) <= alignTime
    )

    if (history1h.length < 60 || history15m.length < 80 || history5m.length < 30) {
      continue
    }

    const signal = runner(symbol, history1h, history15m, history5m, now)
    if (!signal) continue

    const adjusted = applyAdaptiveRR(signal)
    const trade = simulateTrade(adjusted, candles5m, i + 1)
    trades.push(trade)
    skipUntil = i + cooldownBars
  }

  return summarize(symbol, trades)
}

function emptyResult(symbol: string, strategyId: string): BacktestResult {
  return {
    symbol,
    strategyId,
    trades: [],
    totalTrades: 0,
    wins: 0,
    losses: 0,
    breakEven: 0,
    winRate: 0,
    avgWinR: 0,
    avgLossR: 0,
    expectancyR: 0,
    profitFactor: 0,
    maxDrawdownR: 0,
    cumulativeR: 0
  }
}

function summarize(symbol: string, trades: BacktestTrade[]): BacktestResult {
  if (!trades.length) {
    return emptyResult(symbol, trades[0]?.signal.strategy ?? "UNKNOWN")
  }

  const wins = trades.filter((t) => t.pnlR > 0)
  const losses = trades.filter((t) => t.pnlR < 0)
  const breakEven = trades.filter((t) => t.pnlR === 0)

  const avgWinR = wins.length ? wins.reduce((s, t) => s + t.pnlR, 0) / wins.length : 0
  const avgLossR = losses.length
    ? Math.abs(losses.reduce((s, t) => s + t.pnlR, 0) / losses.length)
    : 0
  const winRate = wins.length / trades.length
  const expectancyR = winRate * avgWinR - (1 - winRate) * avgLossR

  const grossWin = wins.reduce((s, t) => s + t.pnlR, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlR, 0))
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0

  let cumulative = 0
  let peak = 0
  let maxDD = 0
  for (const t of trades) {
    cumulative += t.pnlR
    if (cumulative > peak) peak = cumulative
    const dd = peak - cumulative
    if (dd > maxDD) maxDD = dd
  }

  return {
    symbol,
    strategyId: trades[0].signal.strategy,
    trades,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakEven: breakEven.length,
    winRate,
    avgWinR,
    avgLossR,
    expectancyR,
    profitFactor: profitFactor === Infinity ? 999 : profitFactor,
    maxDrawdownR: maxDD,
    cumulativeR: cumulative
  }
}

/* =========================
DIAGNOSTIC MODE

Runs the strategy debug variant on every bar and aggregates which
gates (or preflight conditions) block the most. Useful to understand
whether a backtest with 0 trades is hitting too-strict gates or
simply no setup ever formed.
========================= */

export type BacktestDiagnostic = {
  symbol: string
  barsScanned: number
  signalsFired: number
  gateFailCounts: Record<string, number>
  preflightFailCounts: Record<string, number>
  lastFailure?: {
    failedGates: string[]
    confidence: number
  }
}

export function runBacktestDiagnostic(
  symbol: string,
  candles1h: CandleWithTime[],
  candles15m: CandleWithTime[],
  candles5m: CandleWithTime[],
  options: {
    startOffset?: number
  } = {}
): BacktestDiagnostic {
  const { startOffset = 80 } = options
  const debugRunner = pickDebugRunner(symbol)

  const diagnostic: BacktestDiagnostic = {
    symbol,
    barsScanned: 0,
    signalsFired: 0,
    gateFailCounts: {},
    preflightFailCounts: {}
  }

  if (!debugRunner) return diagnostic

  for (let i = startOffset; i < candles5m.length; i++) {
    const bar = candles5m[i]
    const now = bar.openTime ? new Date(bar.openTime) : new Date()

    const history5m = candles5m.slice(0, i + 1)
    const alignTime = bar.openTime ?? Number.POSITIVE_INFINITY
    const history1h = candles1h.filter(
      (c) => (c.openTime ?? 0) <= alignTime
    )
    const history15m = candles15m.filter(
      (c) => (c.openTime ?? 0) <= alignTime
    )

    if (history1h.length < 60 || history15m.length < 80 || history5m.length < 30) {
      continue
    }

    diagnostic.barsScanned += 1
    const evaluation = debugRunner(symbol, history1h, history15m, history5m, now)

    if (evaluation.passed) {
      diagnostic.signalsFired += 1
      continue
    }

    if (evaluation.prefligthFailed) {
      const k = evaluation.prefligthFailed
      diagnostic.preflightFailCounts[k] = (diagnostic.preflightFailCounts[k] ?? 0) + 1
    }

    for (const gate of evaluation.failedGates) {
      diagnostic.gateFailCounts[gate] = (diagnostic.gateFailCounts[gate] ?? 0) + 1
    }

    diagnostic.lastFailure = {
      failedGates: evaluation.failedGates,
      confidence: evaluation.confidence
    }
  }

  return diagnostic
}
