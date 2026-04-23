import { NextResponse } from "next/server"
import {
  markets,
  type Market,
  type ScanTimeframe
} from "@/lib/markets"
import { monitorOpenTrades, type LivePriceBook } from "@/lib/tradeMonitor"

type Candle = {
  close: number
  volume?: number
}

const livePriceCache = new Map<string, { data: Candle[]; time: number }>()
const CACHE_TTL_MS = 60_000

function safeNumber(v: unknown) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function safeFetch(url: string) {
  try {
    const res = await fetch(url, {
      cache: "no-store"
    })

    const text = await res.text()

    let data: unknown = null

    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }

    if (!res.ok) {
      console.log("LIVE API error:", res.status, url)
      console.log("LIVE API body:", data)
      return null
    }

    return data
  } catch (error) {
    console.log("LIVE fetch error:", error)
    return null
  }
}

function formatForexSymbol(symbol: string) {
  if (symbol === "XAUUSD" || symbol === "XAUUSDT") return "XAU/USD"
  if (symbol === "EURUSD") return "EUR/USD"
  if (symbol === "GBPUSD") return "GBP/USD"
  return symbol
}

function getApiInterval(timeframe: ScanTimeframe) {
  if (timeframe === "SHORT") {
    return {
      binance: "1h",
      twelveData: "1h"
    }
  }

  if (timeframe === "MEDIUM") {
    return {
      binance: "4h",
      twelveData: "4h"
    }
  }

  return {
    binance: "1d",
    twelveData: "1day"
  }
}

function getMarketPriceSource(market: Market) {
  if (market.type === "crypto") return "BINANCE" as const
  return "TWELVEDATA" as const
}

function isTwelveDataError(data: unknown): data is {
  code?: number
  message?: string
  status?: string
} {
  return (
    !!data &&
    typeof data === "object" &&
    ("code" in data || "status" in data || "message" in data)
  )
}

async function getCandles(
  symbol: string,
  type: string,
  timeframe: ScanTimeframe
): Promise<Candle[]> {
  try {
    const cacheKey = `${symbol}-${type}-${timeframe}`
    const cached = livePriceCache.get(cacheKey)
    const now = Date.now()

    if (cached && now - cached.time < CACHE_TTL_MS) {
      return cached.data
    }

    const interval = getApiInterval(timeframe)

    if (type === "crypto") {
      const data = await safeFetch(
        `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval.binance}&limit=2`
      )

      if (!Array.isArray(data)) {
        return []
      }

      const candles = data
        .map((c: any) => ({
          close: safeNumber(c[4]),
          volume: safeNumber(c[5])
        }))
        .filter((c) => c.close > 0)

      livePriceCache.set(cacheKey, { data: candles, time: now })
      return candles
    }

    const apiSymbol = formatForexSymbol(symbol)

    const data = await safeFetch(
      `https://api.twelvedata.com/time_series?symbol=${apiSymbol}&interval=${interval.twelveData}&outputsize=2&apikey=${process.env.TWELVE_KEY}`
    )

    console.log("LIVE TWELVEDATA DEBUG:", symbol, timeframe, data)

    if (
      isTwelveDataError(data) &&
      (data.status === "error" || typeof data.code === "number")
    ) {
      return []
    }

    if (
      !data ||
      typeof data !== "object" ||
      !("values" in data) ||
      !Array.isArray((data as any).values)
    ) {
      return []
    }

    const candles = [...(data as any).values]
      .reverse()
      .map((c: any) => ({
        close: safeNumber(c.close),
        volume: safeNumber(c.volume || 1000)
      }))
      .filter((c) => c.close > 0)

    livePriceCache.set(cacheKey, { data: candles, time: now })
    return candles
  } catch (error) {
    console.log("getCandles live error:", symbol, timeframe, error)
    return []
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const timeframe: ScanTimeframe =
      searchParams.get("timeframe") === "MEDIUM"
        ? "MEDIUM"
        : searchParams.get("timeframe") === "LONG"
        ? "LONG"
        : "SHORT"

    const livePrices: LivePriceBook = {
      BINANCE: {},
      TWELVEDATA: {},
      MT5: {}
    }

    for (const market of markets) {
      const candles = await getCandles(market.symbol, market.type, timeframe)

      if (!candles.length) continue

      const latestPrice = candles[candles.length - 1]?.close
      if (!latestPrice || latestPrice <= 0) continue

      const source = getMarketPriceSource(market)
      livePrices[source][market.symbol] = latestPrice
    }

    const updatedTrades = monitorOpenTrades(livePrices)

    return NextResponse.json({
      success: true,
      timeframe,
      prices: livePrices,
      updatedTradesCount: updatedTrades.length,
      updatedTrades
    })
  } catch (error) {
    console.error("Live prices API error:", error)

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load live prices"
      },
      { status: 500 }
    )
  }
}