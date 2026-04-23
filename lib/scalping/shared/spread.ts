/* =========================
SPREAD GUARD

Per-asset maximum acceptable spread before entering a scalp.
If current bid-ask spread exceeds the threshold the signal is
rejected - the spread would eat too much of the small TP target.

Thresholds are conservative defaults and should be tuned per broker.
========================= */

export type SpreadConfig = {
  /** Max spread in the instrument's quote units (pips for FX, dollars for XAU/BTC). */
  maxSpread: number
  /** Display label. */
  unit: string
}

const SPREAD_LIMITS: Record<string, SpreadConfig> = {
  EURUSD: { maxSpread: 0.00015, unit: "1.5 pips" },
  GBPUSD: { maxSpread: 0.00020, unit: "2.0 pips" },
  XAUUSD: { maxSpread: 0.5, unit: "$0.50" },
  XAUUSDT: { maxSpread: 0.5, unit: "$0.50" },
  BTCUSDT: { maxSpread: 10, unit: "$10" },
  ETHUSDT: { maxSpread: 1, unit: "$1" }
}

export function getMaxSpread(symbol: string): SpreadConfig | null {
  return SPREAD_LIMITS[symbol] ?? null
}

/**
 * Some brokers expose a bid/ask, some only a mid. If we only have
 * the last price, the spread is unknown and this helper returns `true`
 * by default (don't block the scan). Integrations that DO have
 * bid/ask should call this with real values.
 */
export function isSpreadAcceptable(
  symbol: string,
  bid?: number,
  ask?: number
): { ok: boolean; spread?: number; limit?: number; reason?: string } {
  const cfg = getMaxSpread(symbol)

  if (bid === undefined || ask === undefined) {
    // We can't measure it - assume OK but flag it.
    return { ok: true, reason: "SPREAD_UNKNOWN" }
  }

  const spread = ask - bid
  if (spread <= 0) return { ok: false, spread, reason: "INVALID_SPREAD" }

  if (!cfg) return { ok: true, spread, reason: "NO_LIMIT_CONFIGURED" }

  const ok = spread <= cfg.maxSpread
  return {
    ok,
    spread,
    limit: cfg.maxSpread,
    reason: ok ? undefined : `SPREAD_TOO_WIDE (${spread.toFixed(5)} > ${cfg.maxSpread})`
  }
}
