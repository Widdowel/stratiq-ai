/* =========================
ASSET-SPECIFIC SESSION WINDOWS

Tighter than the generic London/NY filter in lib/sessionFilter.ts.
Each asset has a "golden window" where historical performance is
strongest. Outside these windows the signal is rejected.

All times are UTC.
========================= */

type Window = { startH: number; endH: number }

const ASSET_WINDOWS: Record<string, Window[]> = {
  // XAUUSD: London AM is the golden window. NY afternoon is too whippy.
  XAUUSD: [{ startH: 7, endH: 11 }],
  XAUUSDT: [{ startH: 7, endH: 11 }],

  // EURUSD: trade the two opens, skip the midday drift.
  EURUSD: [
    { startH: 8, endH: 11 }, // London open
    { startH: 14, endH: 17 } // NY open + overlap
  ],

  // GBPUSD: same as EUR, slightly earlier.
  GBPUSD: [
    { startH: 8, endH: 11 },
    { startH: 14, endH: 17 }
  ],

  // BTCUSDT: US hours where momentum + volume peak.
  BTCUSDT: [{ startH: 13, endH: 21 }],

  // ETHUSDT: mirrors BTC.
  ETHUSDT: [{ startH: 13, endH: 21 }]
}

function isWeekend(date: Date): boolean {
  const d = date.getUTCDay()
  return d === 0 || d === 6
}

/** Returns true if `symbol` should be tradable at `date`. */
export function isInScalpWindow(symbol: string, date: Date = new Date()): boolean {
  const windows = ASSET_WINDOWS[symbol]
  if (!windows) return false

  // Crypto is the only asset we allow on weekends.
  if (isWeekend(date) && !symbol.endsWith("USDT")) return false

  const h = date.getUTCHours() + date.getUTCMinutes() / 60

  return windows.some((w) => h >= w.startH && h < w.endH)
}

export function getConfiguredWindows(symbol: string): Window[] {
  return ASSET_WINDOWS[symbol] ?? []
}
