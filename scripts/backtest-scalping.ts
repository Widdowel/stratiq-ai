/* =========================
BACKTEST CLI

Usage:
  npx tsx scripts/backtest-scalping.ts BTCUSDT 1000
  npx tsx scripts/backtest-scalping.ts EURUSD 500
  npx tsx scripts/backtest-scalping.ts XAUUSD 500
  npx tsx scripts/backtest-scalping.ts all

Requires .env.local to have TWELVE_KEY set for FX/gold.
========================= */

import { loadBacktestData } from "@/lib/scalping/backtest/dataLoader"
import { runBacktest } from "@/lib/scalping/backtest/runner"

const DEFAULT_BARS = 500

async function backtestOne(symbol: string, bars: number): Promise<void> {
  console.log(`\n[backtest] ${symbol} (${bars} bars of 5m history)`)
  console.log("-".repeat(60))

  const data = await loadBacktestData(symbol, bars)
  if (!data.candles5m.length) {
    console.log("  No data loaded.")
    return
  }

  const result = runBacktest(symbol, data.candles1h, data.candles15m, data.candles5m)

  console.log(`  strategy      : ${result.strategyId}`)
  console.log(`  trades        : ${result.totalTrades}`)
  console.log(`  win / loss    : ${result.wins} / ${result.losses}`)
  console.log(`  win rate      : ${(result.winRate * 100).toFixed(1)}%`)
  console.log(`  avg win / loss: +${result.avgWinR.toFixed(2)}R / -${result.avgLossR.toFixed(2)}R`)
  console.log(`  expectancy    : ${result.expectancyR.toFixed(3)}R / trade`)
  console.log(`  profit factor : ${result.profitFactor === 999 ? "inf" : result.profitFactor.toFixed(2)}`)
  console.log(`  cumulative    : ${result.cumulativeR.toFixed(2)}R`)
  console.log(`  max drawdown  : -${result.maxDrawdownR.toFixed(2)}R`)

  if (result.trades.length > 0) {
    const tp = result.trades.filter((t) => t.closeReason === "TP").length
    const sl = result.trades.filter((t) => t.closeReason === "SL").length
    const beStop = result.trades.filter((t) => t.closeReason === "BE_STOP").length
    const timeout = result.trades.filter((t) => t.closeReason === "TIMEOUT").length
    console.log(`  exits         : TP=${tp} SL=${sl} BE=${beStop} TIMEOUT=${timeout}`)
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const target = args[0] ?? "all"
  const bars = Number(args[1]) || DEFAULT_BARS

  const symbols = target === "all" ? ["BTCUSDT", "EURUSD", "XAUUSD"] : [target]

  for (const s of symbols) {
    try {
      await backtestOne(s, bars)
    } catch (err) {
      console.error(`[backtest] ${s} failed:`, err)
    }
  }
}

main().catch((err) => {
  console.error("[backtest] fatal:", err)
  process.exit(1)
})
