/* =========================
BACKTEST CLI

Usage:
  npx tsx scripts/backtest-scalping.ts BTCUSDT 1000
  npx tsx scripts/backtest-scalping.ts EURUSD 500
  npx tsx scripts/backtest-scalping.ts XAUUSD 500
  npx tsx scripts/backtest-scalping.ts all
  npx tsx scripts/backtest-scalping.ts BTCUSDT 1000 --diag

--diag prints a summary of how many times each gate blocked a signal,
plus the most recent passing factor set. Useful to calibrate floors.

Auto-loads .env.local without a dependency on dotenv.
========================= */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { loadBacktestData } from "@/lib/scalping/backtest/dataLoader"
import {
  runBacktest,
  runBacktestDiagnostic
} from "@/lib/scalping/backtest/runner"

// -------- Env loader --------
function loadDotEnv(path = ".env.local"): void {
  try {
    const content = readFileSync(resolve(process.cwd(), path), "utf-8")
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim()
      if (!line || line.startsWith("#")) continue
      const eq = line.indexOf("=")
      if (eq < 0) continue
      const key = line.slice(0, eq).trim()
      const value = line.slice(eq + 1).trim()
      if (key && !process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // Missing .env.local is not fatal - env may be set elsewhere.
  }
}

loadDotEnv(".env.local")

const DEFAULT_BARS = 500

async function backtestOne(
  symbol: string,
  bars: number,
  diag: boolean
): Promise<void> {
  console.log(`\n[backtest] ${symbol} (${bars} bars of 5m history)`)
  console.log("-".repeat(60))

  const data = await loadBacktestData(symbol, bars)
  if (!data.candles5m.length) {
    console.log("  No data loaded.")
    return
  }

  console.log(`  data loaded   : 1h=${data.candles1h.length} 15m=${data.candles15m.length} 5m=${data.candles5m.length}`)

  if (diag) {
    const diagnostic = runBacktestDiagnostic(
      symbol,
      data.candles1h,
      data.candles15m,
      data.candles5m
    )

    console.log(`  bars scanned  : ${diagnostic.barsScanned}`)
    console.log(`  signals fired : ${diagnostic.signalsFired}`)

    const preflights = Object.entries(diagnostic.preflightFailCounts).sort(
      (a, b) => b[1] - a[1]
    )
    if (preflights.length) {
      console.log(`  preflight fails:`)
      for (const [reason, count] of preflights) {
        console.log(`    - ${reason.padEnd(22)} ${count}`)
      }
    }

    const sorted = Object.entries(diagnostic.gateFailCounts).sort(
      (a, b) => b[1] - a[1]
    )
    if (sorted.length) {
      console.log(`  gate failures :`)
      for (const [gate, count] of sorted) {
        console.log(`    - ${gate.padEnd(22)} ${count}`)
      }
    }
    if (diagnostic.lastFailure) {
      console.log(`  last fail     : ${diagnostic.lastFailure.failedGates.join(", ")} | conf=${diagnostic.lastFailure.confidence}`)
    }
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

    // MFE/MAE distribution - tells us the TRUE optimal TP/SL for this data set.
    const mfes = result.trades.map((t) => t.mfeR).sort((a, b) => a - b)
    const maes = result.trades.map((t) => t.maeR).sort((a, b) => a - b) // negative, sorted ascending = worst first
    const pct = (arr: number[], q: number) => arr[Math.floor(arr.length * q)]
    console.log(`  MFE (peak R+) : p25=${pct(mfes, 0.25)?.toFixed(2)} p50=${pct(mfes, 0.5)?.toFixed(2)} p75=${pct(mfes, 0.75)?.toFixed(2)} max=${mfes[mfes.length - 1]?.toFixed(2)}`)
    console.log(`  MAE (worst R-): p25=${pct(maes, 0.25)?.toFixed(2)} p50=${pct(maes, 0.5)?.toFixed(2)} p75=${pct(maes, 0.75)?.toFixed(2)} min=${maes[0]?.toFixed(2)}`)

    // How many trades would have been winners at various TP levels?
    for (const testTp of [0.5, 0.7, 1.0, 1.3, 1.6]) {
      const wouldHit = mfes.filter((m) => m >= testTp).length
      console.log(`    TP ${testTp}R would hit: ${wouldHit}/${result.trades.length} = ${((wouldHit / result.trades.length) * 100).toFixed(0)}%`)
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const diag = args.includes("--diag") || args.includes("-d")
  const clean = args.filter((a) => !a.startsWith("-"))

  const target = clean[0] ?? "all"
  const bars = Number(clean[1]) || DEFAULT_BARS

  const symbols = target === "all" ? ["BTCUSDT", "EURUSD", "XAUUSD"] : [target]

  for (const s of symbols) {
    try {
      await backtestOne(s, bars, diag)
    } catch (err) {
      console.error(`[backtest] ${s} failed:`, err)
    }
  }
}

main().catch((err) => {
  console.error("[backtest] fatal:", err)
  process.exit(1)
})
