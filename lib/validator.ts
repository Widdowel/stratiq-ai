export type ValidationResult = {
  valid: boolean
  errors: string[]
}

export type ExecutionVenue = "BINANCE_FUTURES" | "EXNESS_MT5"
export type PriceSource = "BINANCE" | "TWELVEDATA" | "MT5"
export type MarginMode = "ISOLATED" | "CROSSED"
export type AccountCurrency = "USD" | "USDT"

export type SignalLike = {
  symbol?: unknown
  direction?: unknown
  timeframe?: unknown
  entry?: unknown
  tp?: unknown
  sl?: unknown
  confidence?: unknown
  positionSize?: unknown
}

export type OpenTradeInput = SignalLike & {
  id?: unknown
  actualLot?: unknown
  actualEntry?: unknown
  quantity?: unknown
  marginUsedUsdt?: unknown
  leverage?: unknown
  marginMode?: unknown
  accountCurrency?: unknown
  notes?: unknown
  executionVenue?: unknown
  priceSource?: unknown
}

export type CloseTradeInput = {
  id?: unknown
  closePrice?: unknown
  closeReason?: unknown
}

const ALLOWED_EXECUTION_VENUES = ["BINANCE_FUTURES", "EXNESS_MT5"] as const
const ALLOWED_PRICE_SOURCES = ["BINANCE", "TWELVEDATA", "MT5"] as const
const ALLOWED_MARGIN_MODES = ["ISOLATED", "CROSSED"] as const
const ALLOWED_ACCOUNT_CURRENCIES = ["USD", "USDT"] as const

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : NaN
}

function isPositiveNumber(value: unknown): boolean {
  const n = toNumber(value)
  return Number.isFinite(n) && n > 0
}

function isValidDirection(value: unknown): value is "BUY" | "SELL" {
  return value === "BUY" || value === "SELL"
}

function isValidTimeframe(value: unknown): value is "SHORT" | "MEDIUM" | "LONG" {
  return value === "SHORT" || value === "MEDIUM" || value === "LONG"
}

function isValidCloseReason(
  value: unknown
): value is "TP" | "SL" | "MANUAL" | "CANCELLED" {
  return (
    value === "TP" ||
    value === "SL" ||
    value === "MANUAL" ||
    value === "CANCELLED"
  )
}

function isValidExecutionVenue(value: unknown): value is ExecutionVenue {
  return value === "BINANCE_FUTURES" || value === "EXNESS_MT5"
}

function isValidPriceSource(value: unknown): value is PriceSource {
  return value === "BINANCE" || value === "TWELVEDATA" || value === "MT5"
}

function isValidMarginMode(value: unknown): value is MarginMode {
  return value === "ISOLATED" || value === "CROSSED"
}

function isValidAccountCurrency(value: unknown): value is AccountCurrency {
  return value === "USD" || value === "USDT"
}

function isVenueAndSourceCompatible(
  executionVenue: ExecutionVenue,
  priceSource: PriceSource
) {
  if (executionVenue === "BINANCE_FUTURES") {
    return priceSource === "BINANCE"
  }

  if (executionVenue === "EXNESS_MT5") {
    return priceSource === "TWELVEDATA" || priceSource === "MT5"
  }

  return false
}

function pushIfInvalidOptionalPositiveNumber(
  errors: string[],
  value: unknown,
  field: string
) {
  if (value !== undefined && value !== null && value !== "") {
    if (!isPositiveNumber(value)) {
      errors.push(`${field} must be a positive number`)
    }
  }
}

function validateSignalLevels(
  direction: unknown,
  entry: unknown,
  tp: unknown,
  sl: unknown,
  errors: string[]
) {
  const parsedEntry = toNumber(entry)
  const parsedTp = toNumber(tp)
  const parsedSl = toNumber(sl)

  if (
    !isValidDirection(direction) ||
    !Number.isFinite(parsedEntry) ||
    !Number.isFinite(parsedTp) ||
    !Number.isFinite(parsedSl)
  ) {
    return
  }

  if (direction === "BUY") {
    if (parsedTp <= parsedEntry) {
      errors.push("BUY signal: tp must be above entry")
    }

    if (parsedSl >= parsedEntry) {
      errors.push("BUY signal: sl must be below entry")
    }
  }

  if (direction === "SELL") {
    if (parsedTp >= parsedEntry) {
      errors.push("SELL signal: tp must be below entry")
    }

    if (parsedSl <= parsedEntry) {
      errors.push("SELL signal: sl must be above entry")
    }
  }
}

export function validateSignal(input: SignalLike): ValidationResult {
  const errors: string[] = []

  if (!isNonEmptyString(input.symbol)) {
    errors.push("symbol is required")
  }

  if (!isValidDirection(input.direction)) {
    errors.push("direction must be BUY or SELL")
  }

  if (!isValidTimeframe(input.timeframe)) {
    errors.push("timeframe must be SHORT, MEDIUM or LONG")
  }

  if (!isPositiveNumber(input.entry)) {
    errors.push("entry must be a positive number")
  }

  if (!isPositiveNumber(input.tp)) {
    errors.push("tp must be a positive number")
  }

  if (!isPositiveNumber(input.sl)) {
    errors.push("sl must be a positive number")
  }

  const confidence = toNumber(input.confidence)

  if (!Number.isFinite(confidence)) {
    errors.push("confidence must be a valid number")
  } else if (confidence < 0 || confidence > 100) {
    errors.push("confidence must be between 0 and 100")
  }

  if (
    input.positionSize !== undefined &&
    input.positionSize !== null &&
    input.positionSize !== "" &&
    !isPositiveNumber(input.positionSize)
  ) {
    errors.push("positionSize must be a positive number")
  }

  validateSignalLevels(
    input.direction,
    input.entry,
    input.tp,
    input.sl,
    errors
  )

  return {
    valid: errors.length === 0,
    errors
  }
}

export function validateOpenTrade(input: OpenTradeInput): ValidationResult {
  const base = validateSignal(input)
  const errors = [...base.errors]

  if (
    input.id !== undefined &&
    input.id !== null &&
    !isNonEmptyString(input.id)
  ) {
    errors.push("id must be a non-empty string")
  }

  pushIfInvalidOptionalPositiveNumber(errors, input.actualLot, "actualLot")
  pushIfInvalidOptionalPositiveNumber(errors, input.actualEntry, "actualEntry")
  pushIfInvalidOptionalPositiveNumber(errors, input.quantity, "quantity")
  pushIfInvalidOptionalPositiveNumber(errors, input.marginUsedUsdt, "marginUsedUsdt")
  pushIfInvalidOptionalPositiveNumber(errors, input.leverage, "leverage")

  if (input.marginMode !== undefined && input.marginMode !== null) {
    if (!isValidMarginMode(input.marginMode)) {
      errors.push(
        `marginMode must be one of: ${ALLOWED_MARGIN_MODES.join(", ")}`
      )
    }
  }

  if (input.accountCurrency !== undefined && input.accountCurrency !== null) {
    if (!isValidAccountCurrency(input.accountCurrency)) {
      errors.push(
        `accountCurrency must be one of: ${ALLOWED_ACCOUNT_CURRENCIES.join(", ")}`
      )
    }
  }

  if (
    input.notes !== undefined &&
    input.notes !== null &&
    typeof input.notes !== "string"
  ) {
    errors.push("notes must be a string")
  }

  if (input.executionVenue === undefined || input.executionVenue === null) {
    errors.push(
      `executionVenue is required (${ALLOWED_EXECUTION_VENUES.join(", ")})`
    )
  } else if (!isValidExecutionVenue(input.executionVenue)) {
    errors.push(
      `executionVenue must be one of: ${ALLOWED_EXECUTION_VENUES.join(", ")}`
    )
  }

  if (input.priceSource === undefined || input.priceSource === null) {
    errors.push(
      `priceSource is required (${ALLOWED_PRICE_SOURCES.join(", ")})`
    )
  } else if (!isValidPriceSource(input.priceSource)) {
    errors.push(
      `priceSource must be one of: ${ALLOWED_PRICE_SOURCES.join(", ")}`
    )
  }

  if (
    isValidExecutionVenue(input.executionVenue) &&
    isValidPriceSource(input.priceSource) &&
    !isVenueAndSourceCompatible(input.executionVenue, input.priceSource)
  ) {
    errors.push("executionVenue and priceSource are not compatible")
  }

  if (input.executionVenue === "BINANCE_FUTURES") {
    if (!isPositiveNumber(input.marginUsedUsdt)) {
      errors.push("BINANCE_FUTURES requires marginUsedUsdt")
    }

    if (!isPositiveNumber(input.leverage)) {
      errors.push("BINANCE_FUTURES requires leverage")
    }

    if (!isValidMarginMode(input.marginMode)) {
      errors.push("BINANCE_FUTURES requires marginMode (ISOLATED or CROSSED)")
    }

    if (!isValidAccountCurrency(input.accountCurrency)) {
      errors.push("BINANCE_FUTURES requires accountCurrency (USD or USDT)")
    }

    if (input.priceSource !== undefined && input.priceSource !== "BINANCE") {
      errors.push("BINANCE_FUTURES requires BINANCE as priceSource")
    }
  }

  if (input.executionVenue === "EXNESS_MT5") {
    if (!isPositiveNumber(input.actualLot)) {
      errors.push("EXNESS_MT5 requires actualLot")
    }

    if (
      input.priceSource !== undefined &&
      input.priceSource !== "TWELVEDATA" &&
      input.priceSource !== "MT5"
    ) {
      errors.push("EXNESS_MT5 requires TWELVEDATA or MT5 as priceSource")
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export function validateCloseTrade(input: CloseTradeInput): ValidationResult {
  const errors: string[] = []

  if (!isNonEmptyString(input.id)) {
    errors.push("id is required")
  }

  if (!isPositiveNumber(input.closePrice)) {
    errors.push("closePrice must be a positive number")
  }

  if (!isValidCloseReason(input.closeReason)) {
    errors.push("closeReason must be TP, SL, MANUAL or CANCELLED")
  }

  return {
    valid: errors.length === 0,
    errors
  }
}