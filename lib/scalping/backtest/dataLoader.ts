/* =========================
BACKTEST DATA LOADER

Pulls historical candles from Binance (crypto) or TwelveData (FX/gold).
Designed to be called from a CLI script (scripts/backtest.ts) or from
an admin API route. Not used on hot paths.

Binance klines limit = 1500 bars per request. For longer history
use iterative pagination (endTime param).
========================= */

import type { CandleWithTime } from "@/lib/scalping/shared/volumeProfile"

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`)
  }
  return res.json()
}

/* =========================
BINANCE (BTCUSDT, crypto)
========================= */

const BINANCE_INTERVALS = {
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d"
} as const

export type BinanceInterval = keyof typeof BINANCE_INTERVALS

const BINANCE_MAX_PER_REQUEST = 1500

/**
 * Fetches up to `bars` candles from Binance, paginating backwards via
 * the `endTime` parameter when `bars > 1500`. Returns in chronological
 * order (oldest first), like the single-request version.
 */
export async function fetchBinanceHistory(
  symbol: string,
  interval: BinanceInterval,
  bars = 1000
): Promise<CandleWithTime[]> {
  const intervalStr = BINANCE_INTERVALS[interval]
  const collected: CandleWithTime[] = []

  // First request: latest bars.
  const first = await fetchBinancePage(symbol, intervalStr, BINANCE_MAX_PER_REQUEST)
  collected.push(...first)

  if (first.length === 0) return []

  // Paginate back until we have enough, capped to avoid runaway loops.
  // Each further request fetches older bars via endTime = oldest openTime - 1.
  let safety = 0
  while (collected.length < bars && safety < 20) {
    const oldest = collected[0]?.openTime
    if (!oldest) break

    const page = await fetchBinancePage(
      symbol,
      intervalStr,
      BINANCE_MAX_PER_REQUEST,
      oldest - 1
    )

    if (page.length === 0) break

    // Page is chronological; prepend before existing.
    collected.unshift(...page)
    safety += 1

    // If the page was smaller than the requested limit, there's nothing older.
    if (page.length < BINANCE_MAX_PER_REQUEST) break
  }

  // Truncate to exactly `bars` keeping the latest.
  return collected.slice(-bars)
}

async function fetchBinancePage(
  symbol: string,
  intervalStr: string,
  limit: number,
  endTime?: number
): Promise<CandleWithTime[]> {
  const params = new URLSearchParams({
    symbol,
    interval: intervalStr,
    limit: String(limit)
  })
  if (endTime !== undefined) {
    params.set("endTime", String(endTime))
  }
  const url = `https://fapi.binance.com/fapi/v1/klines?${params.toString()}`

  const data = await fetchJson(url)
  if (!Array.isArray(data)) return []

  return data.map((row: any[]): CandleWithTime => ({
    open: safeNumber(row[1]),
    high: safeNumber(row[2]),
    low: safeNumber(row[3]),
    close: safeNumber(row[4]),
    volume: safeNumber(row[5]),
    openTime: safeNumber(row[0])
  }))
}

/* =========================
TWELVEDATA (EURUSD, GBPUSD, XAUUSD)
========================= */

export type TwelveDataInterval = "5min" | "15min" | "1h" | "4h" | "1day"

function formatForex(symbol: string): string {
  if (symbol === "XAUUSD" || symbol === "XAUUSDT") return "XAU/USD"
  if (symbol === "EURUSD") return "EUR/USD"
  if (symbol === "GBPUSD") return "GBP/USD"
  return symbol
}

export async function fetchTwelveDataHistory(
  symbol: string,
  interval: TwelveDataInterval,
  bars = 1000,
  apiKey?: string
): Promise<CandleWithTime[]> {
  const key = apiKey ?? process.env.TWELVE_KEY
  if (!key) throw new Error("TWELVE_KEY missing")

  const size = Math.min(bars, 5000)
  const url = `https://api.twelvedata.com/time_series?symbol=${formatForex(symbol)}&interval=${interval}&outputsize=${size}&apikey=${key}`

  const data = await fetchJson(url)
  if (!data || !Array.isArray(data.values)) return []

  // TwelveData returns newest first; reverse to chronological.
  return [...data.values].reverse().map((row: any): CandleWithTime => ({
    open: safeNumber(row.open),
    high: safeNumber(row.high),
    low: safeNumber(row.low),
    close: safeNumber(row.close),
    volume: row.volume !== undefined ? safeNumber(row.volume) : 0,
    openTime: new Date(row.datetime).getTime()
  }))
}

/* =========================
UNIFIED LOADER
========================= */

export type BacktestTimeframes = {
  candles1h: CandleWithTime[]
  candles15m: CandleWithTime[]
  candles5m: CandleWithTime[]
}

/**
 * Fetches enough HTF candles to provide warmup buffer PLUS the scan window.
 * Each scan bar needs 60 1h candles of history for EMA50 + ADX computation,
 * so we fetch `bars/12 + 80` 1h candles (80 extra = 80h = ~3.3 days of
 * warmup, enough for EMA50 + ADX14 to stabilize).
 */
export async function loadBacktestData(
  symbol: string,
  bars = 1000
): Promise<BacktestTimeframes> {
  const hourCount = Math.ceil(bars / 12) + 80 // warmup buffer
  const q15Count = Math.ceil(bars / 3) + 200 // also extra for 15m warmup

  if (symbol === "BTCUSDT" || symbol === "ETHUSDT") {
    const [c1h, c15m, c5m] = await Promise.all([
      fetchBinanceHistory(symbol, "1h", hourCount),
      fetchBinanceHistory(symbol, "15m", q15Count),
      fetchBinanceHistory(symbol, "5m", bars)
    ])
    return { candles1h: c1h, candles15m: c15m, candles5m: c5m }
  }

  const [c1h, c15m, c5m] = await Promise.all([
    fetchTwelveDataHistory(symbol, "1h", hourCount),
    fetchTwelveDataHistory(symbol, "15min", q15Count),
    fetchTwelveDataHistory(symbol, "5min", bars)
  ])
  return { candles1h: c1h, candles15m: c15m, candles5m: c5m }
}
