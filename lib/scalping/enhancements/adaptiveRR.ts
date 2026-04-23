/* =========================
ADAPTIVE RISK-REWARD

Confidence-based TP extension. Higher-conviction signals get a wider
TP so we monetize the A+ setups. Lower-conviction signals get taken
out faster (RR 1.5) so we bank wins before mean reversion hits.

  Confidence      RR multiplier
  [80, 85)        1.5
  [85, 90)        2.0
  [90, 100]       2.5

The base signal is generated with RR 1.5 fixed; this layer
upgrades the TP when the confidence clears the higher tiers.
========================= */

import type { ScalpSignal } from "@/lib/scalping/types"

// Very modest bumps only for high-conviction signals. Base RR is set per
// strategy and optimized on the MFE distribution; adaptive adds a small
// reward for the strongest setups without pushing TP out of reach.
export const RR_TIERS: { min: number; rr: number }[] = [
  { min: 93, rr: 1.0 }, // only elite signals get 1R
  { min: 88, rr: 0.7 }, // moderate bump
  { min: 80, rr: 0.5 } // baseline matches strategy defaults
]

export function getAdaptiveRR(confidence: number): number {
  for (const t of RR_TIERS) {
    if (confidence >= t.min) return t.rr
  }
  return 1.0
}

/**
 * Returns a NEW signal with the TP recomputed to match the adaptive
 * RR, keeping entry and SL identical. Caller should swap the old
 * TP for this new one before publishing.
 */
export function applyAdaptiveRR(signal: ScalpSignal): ScalpSignal {
  const newRR = getAdaptiveRR(signal.confidence)
  if (newRR <= signal.rr) return signal // don't shrink TPs

  const risk = Math.abs(signal.entry - signal.sl)
  if (!risk) return signal

  const newTp =
    signal.direction === "BUY"
      ? signal.entry + risk * newRR
      : signal.entry - risk * newRR

  return {
    ...signal,
    tp: Number(newTp.toFixed(5)),
    rr: newRR
  }
}
