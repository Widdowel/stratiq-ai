/* =========================
STRICT NEWS BLACKOUT

Hardened wrapper around macroFilter.ts.

 - HIGH impact events (FOMC, NFP, CPI, ECB, BoE rate decisions) within
   [-30min, +15min] = HARD BLOCK, signal rejected.
 - MEDIUM impact events within [-10min, +5min] = HARD BLOCK.
 - Everything else = pass.

This is stricter than the existing macroFilter which only soft-blocks
with position size adjustments.
========================= */

import { getMacroNews } from "@/lib/macroNews"
import type { MacroEvent } from "@/lib/macroNews"

export type NewsBlackoutCheck =
  | { blocked: false }
  | { blocked: true; event: MacroEvent; minutesFromEvent: number }

const HIGH_PRE_MIN = 30
const HIGH_POST_MIN = 15
const MED_PRE_MIN = 10
const MED_POST_MIN = 5

function isUsdAsset(symbol: string): boolean {
  return (
    symbol.includes("USD") ||
    symbol.endsWith("USDT") ||
    symbol === "XAUUSD" ||
    symbol === "XAUUSDT"
  )
}

function isEurAsset(symbol: string): boolean {
  return symbol === "EURUSD"
}

function isGbpAsset(symbol: string): boolean {
  return symbol === "GBPUSD"
}

function eventAffectsSymbol(symbol: string, event: MacroEvent): boolean {
  const currency = (event.currency ?? "").toUpperCase()
  const country = (event.country ?? "").toLowerCase()
  const text = `${event.event} ${event.category ?? ""}`.toLowerCase()

  const isUsd =
    currency === "USD" ||
    country.includes("united states") ||
    text.includes("fed") ||
    text.includes("fomc") ||
    text.includes("nfp") ||
    text.includes("cpi") ||
    text.includes("ppi") ||
    text.includes("pce") ||
    text.includes("non farm") ||
    text.includes("non-farm") ||
    text.includes("powell") ||
    text.includes("jobless") ||
    text.includes("rate decision")

  const isEur =
    currency === "EUR" ||
    country.includes("euro area") ||
    country.includes("eurozone") ||
    text.includes("ecb") ||
    text.includes("lagarde")

  const isGbp =
    currency === "GBP" ||
    country.includes("united kingdom") ||
    country.includes("britain") ||
    text.includes("boe") ||
    text.includes("bank of england")

  if (isUsdAsset(symbol) && isUsd) return true
  if (isEurAsset(symbol) && isEur) return true
  if (isGbpAsset(symbol) && isGbp) return true

  return false
}

export function checkNewsBlackout(
  symbol: string,
  events: MacroEvent[],
  now: Date = new Date()
): NewsBlackoutCheck {
  for (const event of events) {
    if (!eventAffectsSymbol(symbol, event)) continue

    const eventTime = new Date(event.date).getTime()
    if (!eventTime || Number.isNaN(eventTime)) continue

    const minutesFromEvent = (eventTime - now.getTime()) / 60000

    if (event.importance === "HIGH") {
      if (minutesFromEvent >= -HIGH_POST_MIN && minutesFromEvent <= HIGH_PRE_MIN) {
        return { blocked: true, event, minutesFromEvent }
      }
    }

    if (event.importance === "MEDIUM") {
      if (minutesFromEvent >= -MED_POST_MIN && minutesFromEvent <= MED_PRE_MIN) {
        return { blocked: true, event, minutesFromEvent }
      }
    }
  }

  return { blocked: false }
}

/** Fetches fresh events and runs the check. Convenience wrapper. */
export async function checkNewsBlackoutFresh(
  symbol: string,
  now: Date = new Date()
): Promise<NewsBlackoutCheck> {
  const events = await getMacroNews()
  return checkNewsBlackout(symbol, events, now)
}
