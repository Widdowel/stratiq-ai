/* =========================
CONFLUENCE SCORING ENGINE

This replaces the old "score = 50 + bunch_of_small_bonuses" approach
which made it trivial to hit the floor with mediocre signals.

New model:
 1. GATES   - hard boolean conditions. If ANY fails, the signal is killed.
 2. FACTORS - weighted contributions to the confidence score (0-100).

Signal is published ONLY if:
 - All gates pass
 - Confidence >= floor

This gives us binary AND-logic filtering, not additive soup.
========================= */

export type Gate = {
  name: string
  passed: boolean
  /** Short human-readable reason if the gate failed. */
  reason?: string
}

export type Factor = {
  name: string
  /** Signed contribution. Positive = bullish/bearish alignment. */
  points: number
  /** Evidence (e.g., "ADX=28", "RSI=62"). */
  note?: string
}

export type ConfluenceResult = {
  passed: boolean
  confidence: number
  gates: Gate[]
  factors: Factor[]
  failedGates: string[]
  baseScore: number
}

const BASE_SCORE = 50

/**
 * Evaluate a set of gates. Returns whether all passed and the list
 * of failed gate names (for logging / debugging).
 */
export function evaluateGates(gates: Gate[]): { passed: boolean; failed: string[] } {
  const failed = gates.filter((g) => !g.passed).map((g) => g.name)
  return { passed: failed.length === 0, failed }
}

/**
 * Combine a list of factors into a single confidence score,
 * starting at BASE_SCORE and clamped to [0, 100].
 */
export function scoreFactors(factors: Factor[]): number {
  const raw = BASE_SCORE + factors.reduce((s, f) => s + f.points, 0)
  return Math.max(0, Math.min(100, raw))
}

/**
 * Main evaluator. Use this from every strategy.
 *
 *   const result = evaluateConfluence(gates, factors, 80)
 *   if (!result.passed) return null
 *   signal.confidence = result.confidence
 */
export function evaluateConfluence(
  gates: Gate[],
  factors: Factor[],
  floor = 80
): ConfluenceResult {
  const gateCheck = evaluateGates(gates)
  const confidence = scoreFactors(factors)
  const passed = gateCheck.passed && confidence >= floor

  return {
    passed,
    confidence,
    gates,
    factors,
    failedGates: gateCheck.failed,
    baseScore: BASE_SCORE
  }
}

/* =========================
GATE HELPERS
========================= */

export function gate(name: string, passed: boolean, reason?: string): Gate {
  return { name, passed, reason }
}

export function factor(name: string, points: number, note?: string): Factor {
  return { name, points, note }
}
