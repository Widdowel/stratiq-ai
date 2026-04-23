import { getMarketType } from "./markets"

/* =========================
SAFE NUMBER
========================= */

function safeNumber(v: any) {
  const n = Number(v)
  return isFinite(n) ? n : 0
}

/* =========================
SIGNAL STATUS TYPE
========================= */

export type SignalStatus =
  | "OPEN"
  | "TP1_HIT"
  | "TP2_HIT"
  | "SL_HIT"

/* =========================
SAFE FETCH
========================= */

async function safeFetch(url: string) {
  try {
    const res = await fetch(url, { cache: "no-store" })

    if (!res.ok) {
      console.log("API error:", res.status, url)
      return null
    }

    return await res.json()
  } catch (error) {
    console.log("Fetch error:", error)
    return null
  }
}

/* =========================
FORMAT SYMBOL
========================= */

function formatForexSymbol(symbol: string) {
  if (symbol === "XAUUSD") return "XAU/USD"

  if (symbol.endsWith("USD")) {
    return symbol.replace("USD", "/USD")
  }

  return symbol
}

/* =========================
GET LIVE PRICE
========================= */

export async function getLivePrice(symbol: string) {
  const type = getMarketType(symbol)

  try {
    /* CRYPTO */

    if (type === "crypto") {
      const data = await safeFetch(
        `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`
      )

      return safeNumber(data?.price)
    }

    /* FOREX / GOLD */

    const apiSymbol = formatForexSymbol(symbol)

    const data = await safeFetch(
      `https://api.twelvedata.com/price?symbol=${apiSymbol}&apikey=${process.env.TWELVE_KEY}`
    )

    if (!data?.price) {
      console.log("⚠ TwelveData price missing:", apiSymbol)
    }

    return safeNumber(data?.price)
  } catch (error) {
    console.log("getLivePrice error:", symbol, error)
    return 0
  }
}

/* =========================
CALCULATE PROFIT
========================= */

export function calculateProfit(
  entry: number,
  price: number,
  direction: "BUY" | "SELL"
) {
  if (!entry || !price) return 0

  let profit = 0

  if (direction === "BUY") {
    profit = ((price - entry) / entry) * 100
  } else {
    profit = ((entry - price) / entry) * 100
  }

  return isFinite(profit) ? profit : 0
}

/* =========================
CHECK SIGNAL STATUS
========================= */

export function checkSignalStatus(
  signal: any,
  price: number
): SignalStatus {
  const tp1 = safeNumber(signal.tp1)
  const tp2 = safeNumber(signal.tp2)
  const sl = safeNumber(signal.sl)

  const direction =
    signal.direction === "SELL" ? "SELL" : "BUY"

  let status: SignalStatus = "OPEN"

  if (direction === "BUY") {
    if (tp2 && price >= tp2) status = "TP2_HIT"
    else if (tp1 && price >= tp1) status = "TP1_HIT"
    else if (sl && price <= sl) status = "SL_HIT"
  } else {
    if (tp2 && price <= tp2) status = "TP2_HIT"
    else if (tp1 && price <= tp1) status = "TP1_HIT"
    else if (sl && price >= sl) status = "SL_HIT"
  }

  return status
}

/* =========================
TRACK SIGNAL
========================= */

export async function trackSignal(signal: any) {
  const symbol = signal?.symbol

  if (!symbol) return null

  const price = await getLivePrice(symbol)

  if (!price) return null

  const profit = calculateProfit(
    safeNumber(signal.entry),
    price,
    signal.direction === "SELL" ? "SELL" : "BUY"
  )

  const status = checkSignalStatus(signal, price)

  return {
    symbol,
    price,
    profit: Number(profit.toFixed(4)),
    status
  }
}