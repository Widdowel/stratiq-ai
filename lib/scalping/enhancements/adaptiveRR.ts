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

// v6 analysis showed adaptiveRR consistently pushed TPs beyond the MFE
// distribution. Strategy-native RR was calibrated on MFE data but adaptive
// silently bumped the target beyond reach for 87+ confidence signals,
// sabotaging the whole TP logic.
//
// Disabled: all tiers return 0 so `if (newRR <= signal.rr) return signal`
// short-circuits and no bump ever occurs. Keep the type/shape so the
// feature can be re-enabled later with better calibration.
export const RR_TIERS: { min: number; rr: number }[] = [
  { min: 93, rr: 0 },
  { min: 88, rr: 0 },
  { min: 80, rr: 0 }
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
