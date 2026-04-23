/* =========================
BREAK-EVEN MANAGER

Core winrate booster: as soon as price moves in our favor by more
than `triggerFraction * initialRisk`, the SL is moved to entry.
Trades that would have ended as small losses become scratches.

Each open trade has a `breakEvenTrigger` field already set at
signal generation time. Here we compare current price vs trigger,
and if crossed, we advance the SL.

This is a PURE FUNCTION - it returns the updated SL if a move is
needed, or null if not. The caller is responsible for persisting
the new SL to the trade store.
========================= */

export type TradeBEInput = {
  id: string
  direction: "BUY" | "SELL"
  entry: number
  sl: number
  breakEvenTrigger: number
  /** Whether BE has already been moved (prevents double moves). */
  breakEvenApplied?: boolean
}

export type BEDecision = {
  shouldMove: boolean
  newSl?: number
  reason?: string
}

export function evaluateBreakEven(
  trade: TradeBEInput,
  currentPrice: number
): BEDecision {
  if (trade.breakEvenApplied) {
    return { shouldMove: false, reason: "ALREADY_APPLIED" }
  }

  if (!trade.breakEvenTrigger || !currentPrice) {
    return { shouldMove: false, reason: "MISSING_DATA" }
  }

  if (trade.direction === "BUY") {
    if (currentPrice >= trade.breakEvenTrigger) {
      // Move SL up to entry. Never move it DOWN (regression protection).
      if (trade.sl < trade.entry) {
        return { shouldMove: true, newSl: trade.entry, reason: "BE_TRIGGER_HIT" }
      }
      return { shouldMove: false, reason: "SL_ALREADY_AT_OR_ABOVE_ENTRY" }
    }
    return { shouldMove: false, reason: "PRICE_BELOW_TRIGGER" }
  }

  if (trade.direction === "SELL") {
    if (currentPrice <= trade.breakEvenTrigger) {
      if (trade.sl > trade.entry) {
        return { shouldMove: true, newSl: trade.entry, reason: "BE_TRIGGER_HIT" }
      }
      return { shouldMove: false, reason: "SL_ALREADY_AT_OR_BELOW_ENTRY" }
    }
    return { shouldMove: false, reason: "PRICE_ABOVE_TRIGGER" }
  }

  return { shouldMove: false, reason: "UNKNOWN_DIRECTION" }
}

/**
 * Batch evaluate multiple open trades and return the list of BE
 * moves to apply. Use this from the trade monitor.
 */
export function batchEvaluateBreakEven(
  trades: TradeBEInput[],
  priceBook: Record<string, number>
): { tradeId: string; newSl: number }[] {
  const moves: { tradeId: string; newSl: number }[] = []

  for (const trade of trades) {
    const price = priceBook[(trade as any).symbol]
    if (!price) continue

    const decision = evaluateBreakEven(trade, price)
    if (decision.shouldMove && decision.newSl !== undefined) {
      moves.push({ tradeId: trade.id, newSl: decision.newSl })
    }
  }

  return moves
}
