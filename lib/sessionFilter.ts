/* =========================
SESSION FILTER

Keeps FX / gold / index trading within liquid London / New York
sessions. Signals generated outside liquid windows tend to get
fake-breakouts in thin Asian books.

Crypto is assumed 24/7 and always passes.
========================= */

export type TradingSession = "ASIA" | "LONDON" | "NY" | "OVERLAP_LN_NY" | "OFF"

function getHourUTC(date: Date): number {
  return date.getUTCHours() + date.getUTCMinutes() / 60
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay()
  return day === 0 || day === 6
}

export function getSessionAt(date: Date): TradingSession {
  if (isWeekend(date)) return "OFF"

  const h = getHourUTC(date)

  // London 07:00 - 16:00 UTC, NY 13:00 - 21:00 UTC.
  const london = h >= 7 && h < 16
  const ny = h >= 13 && h < 21

  if (london && ny) return "OVERLAP_LN_NY"
  if (london) return "LONDON"
  if (ny) return "NY"

  // 00:00 - 07:00 UTC â‰ˆ Asia close / Tokyo morning
  if (h >= 0 && h < 7) return "ASIA"

  return "OFF"
}

function isCryptoSymbol(symbol: string): boolean {
  return symbol.endsWith("USDT") && symbol !== "XAUUSDT"
}

export function isSymbolInActiveSession(
  symbol: string,
  date: Date = new Date()
): boolean {
  if (isCryptoSymbol(symbol)) return true

  const session = getSessionAt(date)
  return session === "LONDON" || session === "NY" || session === "OVERLAP_LN_NY"
}
