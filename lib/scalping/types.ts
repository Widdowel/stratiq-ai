/* =========================
SCALP SIGNAL TYPE

Common output type for all scalping strategies. Single entry / single exit
as per product requirement. Break-even manager can later mutate the SL to
entry but that's post-entry, not a second TP.
========================= */

export type ScalpDirection = "BUY" | "SELL"

export type ScalpStrategyId =
  | "BTC_BREAKOUT_RETEST"
  | "EURUSD_VWAP_PULLBACK"
  | "XAUUSD_LIQUIDITY_SWEEP"

export type ScalpSignal = {
  /** Unique id (symbol + strategy + timestamp). */
  id: string
  symbol: string
  strategy: ScalpStrategyId
  direction: ScalpDirection

  entry: number
  sl: number
  tp: number

  /** Confidence 0-100, already above the floor. */
  confidence: number

  /** Risk/reward ratio = |tp-entry| / |entry-sl| */
  rr: number

  /** Price at which the break-even manager should move SL to entry. */
  breakEvenTrigger: number

  /** Unix ms the signal was generated. */
  generatedAt: number

  /** Debug trail of factors and passed gates. */
  debug: {
    gates: { name: string; passed: boolean; reason?: string }[]
    factors: { name: string; points: number; note?: string }[]
  }
}
