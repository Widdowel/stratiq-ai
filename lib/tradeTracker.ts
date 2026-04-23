import fs from "node:fs"
import path from "node:path"
import { recordStopLossHit } from "@/lib/cooldown"

export type TradeStatus =
  | "SIGNAL"
  | "OPEN"
  | "SL_HIT"
  | "CLOSED"
  | "CANCELLED"

export type CloseReason =
  | "TP"
  | "SL"
  | "MANUAL"
  | "CANCELLED"

export type TradeDirection = "BUY" | "SELL"
export type TradeTimeframe = "SHORT" | "MEDIUM" | "LONG"

export type ExecutionVenue = "BINANCE_FUTURES" | "EXNESS_MT5"
export type PriceSource = "BINANCE" | "TWELVEDATA" | "MT5"
export type MarginMode = "ISOLATED" | "CROSSED"
export type AccountCurrency = "USD" | "USDT"

export type TradeRecord = {
  id: string
  symbol: string
  direction: TradeDirection
  timeframe: TradeTimeframe
  entry: number
  tp: number
  sl: number
  confidence: number
  positionSize: number

  executionVenue?: ExecutionVenue
  priceSource?: PriceSource

  actualLot?: number
  actualEntry?: number
  quantity?: number
  marginUsedUsdt?: number
  leverage?: number
  marginMode?: MarginMode
  accountCurrency?: AccountCurrency
  notes?: string

  status: TradeStatus
  createdAt: string
  executedAt?: string
  openedAt?: string
  closedAt?: string

  closePrice?: number
  closeReason?: CloseReason
  priceChange?: number
  pnl?: number
}

type TradeBaseInput = Omit<
  TradeRecord,
  | "status"
  | "createdAt"
  | "executedAt"
  | "openedAt"
  | "closedAt"
  | "closePrice"
  | "closeReason"
  | "priceChange"
  | "pnl"
>

type OpenTradeInput = TradeBaseInput
type SignalInput = TradeBaseInput

const DATA_DIR = path.join(process.cwd(), "data")
const TRADES_FILE = path.join(DATA_DIR, "trades.json")

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }

  if (!fs.existsSync(TRADES_FILE)) {
    fs.writeFileSync(TRADES_FILE, "[]", "utf-8")
  }
}

function safeNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function isValidPositiveNumber(value: unknown): boolean {
  const n = Number(value)
  return Number.isFinite(n) && n > 0
}

function round(value: number, decimals = 4): number {
  return Number(value.toFixed(decimals))
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim()
}

function isTradeDirection(value: unknown): value is TradeDirection {
  return value === "BUY" || value === "SELL"
}

function isTradeTimeframe(value: unknown): value is TradeTimeframe {
  return value === "SHORT" || value === "MEDIUM" || value === "LONG"
}

function isTradeStatus(value: unknown): value is TradeStatus {
  return (
    value === "SIGNAL" ||
    value === "OPEN" ||
    value === "SL_HIT" ||
    value === "CLOSED" ||
    value === "CANCELLED"
  )
}

function isPriceSource(value: unknown): value is PriceSource {
  return value === "BINANCE" || value === "TWELVEDATA" || value === "MT5"
}

function isExecutionVenue(value: unknown): value is ExecutionVenue {
  return value === "BINANCE_FUTURES" || value === "EXNESS_MT5"
}

function isMarginMode(value: unknown): value is MarginMode {
  return value === "ISOLATED" || value === "CROSSED"
}

function isAccountCurrency(value: unknown): value is AccountCurrency {
  return value === "USD" || value === "USDT"
}

function isCloseReason(value: unknown): value is CloseReason {
  return (
    value === "TP" ||
    value === "SL" ||
    value === "MANUAL" ||
    value === "CANCELLED"
  )
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined
  }

  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function validateTradeLevels(
  direction: TradeDirection,
  entry: number,
  tp: number,
  sl: number
) {
  if (!isValidPositiveNumber(entry)) return false
  if (!isValidPositiveNumber(tp)) return false
  if (!isValidPositiveNumber(sl)) return false

  if (direction === "BUY") {
    return tp > entry && sl < entry
  }

  return tp < entry && sl > entry
}

function normalizeTrade(raw: any): TradeRecord {
  const direction: TradeDirection = isTradeDirection(raw.direction)
    ? raw.direction
    : "BUY"

  const timeframe: TradeTimeframe = isTradeTimeframe(raw.timeframe)
    ? raw.timeframe
    : "SHORT"

  const status: TradeStatus = isTradeStatus(raw.status)
    ? raw.status
    : "SIGNAL"

  return {
    id: safeString(raw.id),
    symbol: safeString(raw.symbol),
    direction,
    timeframe,
    entry: safeNumber(raw.entry),
    tp: safeNumber(raw.tp ?? raw.tp1),
    sl: safeNumber(raw.sl),
    confidence: safeNumber(raw.confidence),
    positionSize: safeNumber(raw.positionSize || 1),

    executionVenue: isExecutionVenue(raw.executionVenue)
      ? raw.executionVenue
      : undefined,
    priceSource: isPriceSource(raw.priceSource)
      ? raw.priceSource
      : undefined,

    actualLot: normalizeOptionalNumber(raw.actualLot),
    actualEntry: normalizeOptionalNumber(raw.actualEntry),
    quantity: normalizeOptionalNumber(raw.quantity),
    marginUsedUsdt: normalizeOptionalNumber(raw.marginUsedUsdt),
    leverage: normalizeOptionalNumber(raw.leverage),
    marginMode: isMarginMode(raw.marginMode) ? raw.marginMode : undefined,
    accountCurrency: isAccountCurrency(raw.accountCurrency)
      ? raw.accountCurrency
      : undefined,
    notes: typeof raw.notes === "string" ? raw.notes.trim() || undefined : undefined,

    status,
    createdAt: safeString(raw.createdAt),
    executedAt: raw.executedAt ? safeString(raw.executedAt) : undefined,
    openedAt: raw.openedAt ? safeString(raw.openedAt) : undefined,
    closedAt: raw.closedAt ? safeString(raw.closedAt) : undefined,

    closePrice: normalizeOptionalNumber(raw.closePrice),
    closeReason: isCloseReason(raw.closeReason) ? raw.closeReason : undefined,
    priceChange: normalizeOptionalNumber(raw.priceChange),
    pnl: normalizeOptionalNumber(raw.pnl)
  }
}

function loadTradesFromFile(): TradeRecord[] {
  try {
    ensureStorage()

    const raw = fs.readFileSync(TRADES_FILE, "utf-8")
    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map(normalizeTrade)
      .filter(
        (trade) =>
          !!trade.id &&
          !!trade.symbol &&
          isTradeDirection(trade.direction) &&
          isTradeTimeframe(trade.timeframe)
      )
  } catch (error) {
    console.error("loadTradesFromFile error:", error)
    return []
  }
}

function saveTradesToFile(trades: TradeRecord[]) {
  try {
    ensureStorage()
    fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2), "utf-8")
  } catch (error) {
    console.error("saveTradesToFile error:", error)
  }
}

function getExecutionEntry(trade: TradeRecord) {
  return safeNumber(trade.actualEntry ?? trade.entry)
}

function calculatePriceChange(
  direction: TradeDirection,
  entry: number,
  closePrice: number
) {
  const safeEntry = safeNumber(entry)
  const safeClose = safeNumber(closePrice)

  if (!safeEntry || !safeClose) return 0

  const diff =
    direction === "BUY"
      ? safeClose - safeEntry
      : safeEntry - safeClose

  return round(diff, 4)
}

function calculateMonetaryPnl(trade: TradeRecord, closePrice: number) {
  const executionEntry = getExecutionEntry(trade)
  const priceChange = calculatePriceChange(
    trade.direction,
    executionEntry,
    closePrice
  )

  if (!executionEntry || !closePrice) {
    return {
      priceChange: 0,
      pnl: 0
    }
  }

  if (trade.symbol.endsWith("USDT")) {
    const quantity = safeNumber(trade.quantity)

    if (quantity > 0) {
      return {
        priceChange,
        pnl: round(priceChange * quantity, 4)
      }
    }

    const marginUsedUsdt = safeNumber(trade.marginUsedUsdt)
    const leverage = safeNumber(trade.leverage)

    if (marginUsedUsdt > 0 && leverage > 0 && executionEntry > 0) {
      const estimatedQuantity = (marginUsedUsdt * leverage) / executionEntry

      return {
        priceChange,
        pnl: round(priceChange * estimatedQuantity, 4)
      }
    }

    return {
      priceChange,
      pnl: round(priceChange, 4)
    }
  }

  if (trade.symbol === "XAUUSD" || trade.symbol === "XAUUSDT") {
    const lot = safeNumber(trade.actualLot)

    if (lot > 0) {
      return {
        priceChange,
        pnl: round(priceChange * lot * 100, 4)
      }
    }

    return {
      priceChange,
      pnl: round(priceChange, 4)
    }
  }

  if (trade.symbol.endsWith("USD")) {
    const lot = safeNumber(trade.actualLot)

    if (lot > 0) {
      return {
        priceChange,
        pnl: round(priceChange * lot * 100000, 4)
      }
    }

    return {
      priceChange,
      pnl: round(priceChange, 4)
    }
  }

  return {
    priceChange,
    pnl: round(priceChange, 4)
  }
}

function buildBaseTradeRecord(input: TradeBaseInput): TradeBaseInput {
  const direction: TradeDirection = input.direction
  const entry = safeNumber(input.entry)
  const tp = safeNumber(input.tp)
  const sl = safeNumber(input.sl)

  const id = safeString(input.id)
  const symbol = safeString(input.symbol)

  if (!id) {
    throw new Error("Trade id is required")
  }

  if (!symbol) {
    throw new Error("Trade symbol is required")
  }

  if (!validateTradeLevels(direction, entry, tp, sl)) {
    throw new Error("Invalid trade levels")
  }

  return {
    ...input,
    id,
    symbol,
    entry,
    tp,
    sl,
    confidence: safeNumber(input.confidence),
    positionSize: safeNumber(input.positionSize || 1),
    actualLot: normalizeOptionalNumber(input.actualLot),
    actualEntry: normalizeOptionalNumber(input.actualEntry),
    quantity: normalizeOptionalNumber(input.quantity),
    marginUsedUsdt: normalizeOptionalNumber(input.marginUsedUsdt),
    leverage: normalizeOptionalNumber(input.leverage),
    notes: typeof input.notes === "string" ? input.notes.trim() || undefined : undefined
  }
}

export function getAllTrades(): TradeRecord[] {
  return loadTradesFromFile()
}

export function getOpenTrades(): TradeRecord[] {
  return getAllTrades().filter((trade) => trade.status === "OPEN")
}

export function getClosedTrades(): TradeRecord[] {
  return getAllTrades().filter(
    (trade) =>
      trade.status === "CLOSED" ||
      trade.status === "SL_HIT" ||
      trade.status === "CANCELLED"
  )
}

export function getSignals(): TradeRecord[] {
  return getAllTrades().filter((trade) => trade.status === "SIGNAL")
}

export function getTradeById(id: string): TradeRecord | null {
  return getAllTrades().find((trade) => trade.id === id) ?? null
}

export function createSignal(signal: SignalInput): TradeRecord {
  const trades = loadTradesFromFile()
  const base = buildBaseTradeRecord(signal)
  const existingIndex = trades.findIndex((trade) => trade.id === base.id)

  const existing = existingIndex >= 0 ? trades[existingIndex] : null

  const record: TradeRecord = {
    ...base,
    status: "SIGNAL",
    createdAt: existing?.createdAt || new Date().toISOString()
  }

  if (existingIndex >= 0) {
    trades[existingIndex] = {
      ...existing,
      ...record
    }
  } else {
    trades.push(record)
  }

  saveTradesToFile(trades)
  return existingIndex >= 0 ? trades[existingIndex] : record
}

export function openTrade(input: OpenTradeInput): TradeRecord {
  const trades = loadTradesFromFile()
  const now = new Date().toISOString()

  const base = buildBaseTradeRecord(input)
  const existingIndex = trades.findIndex((trade) => trade.id === base.id)
  const existing = existingIndex >= 0 ? trades[existingIndex] : null

  const record: TradeRecord = {
    ...base,
    status: "OPEN",
    createdAt: existing?.createdAt || now,
    executedAt: now,
    openedAt: now
  }

  if (existingIndex >= 0) {
    trades[existingIndex] = {
      ...existing,
      ...record
    }
  } else {
    trades.push(record)
  }

  saveTradesToFile(trades)
  return existingIndex >= 0 ? trades[existingIndex] : record
}

export function markSignalAsOpen(
  id: string,
  payload?: {
    actualLot?: number
    actualEntry?: number
    quantity?: number
    marginUsedUsdt?: number
    leverage?: number
    marginMode?: MarginMode
    accountCurrency?: AccountCurrency
    notes?: string
    executionVenue?: ExecutionVenue
    priceSource?: PriceSource
  }
): TradeRecord | null {
  const trades = loadTradesFromFile()
  const trade = trades.find((item) => item.id === id)

  if (!trade || trade.status !== "SIGNAL") {
    return null
  }

  const now = new Date().toISOString()

  trade.status = "OPEN"
  trade.executedAt = now
  trade.openedAt = now

  if (payload?.actualLot !== undefined) {
    trade.actualLot = safeNumber(payload.actualLot)
  }

  if (payload?.actualEntry !== undefined) {
    trade.actualEntry = safeNumber(payload.actualEntry)
  }

  if (payload?.quantity !== undefined) {
    trade.quantity = safeNumber(payload.quantity)
  }

  if (payload?.marginUsedUsdt !== undefined) {
    trade.marginUsedUsdt = safeNumber(payload.marginUsedUsdt)
  }

  if (payload?.leverage !== undefined) {
    trade.leverage = safeNumber(payload.leverage)
  }

  if (payload?.marginMode !== undefined) {
    trade.marginMode = payload.marginMode
  }

  if (payload?.accountCurrency !== undefined) {
    trade.accountCurrency = payload.accountCurrency
  }

  if (payload?.notes !== undefined) {
    trade.notes = payload.notes?.trim() || undefined
  }

  if (payload?.executionVenue !== undefined) {
    trade.executionVenue = payload.executionVenue
  }

  if (payload?.priceSource !== undefined) {
    trade.priceSource = payload.priceSource
  }

  saveTradesToFile(trades)
  return trade
}

export function closeTrade(
  id: string,
  closePrice: number,
  closeReason: CloseReason
): TradeRecord | null {
  const trades = loadTradesFromFile()
  const trade = trades.find((item) => item.id === id)

  if (!trade) {
    return null
  }

  if (
    trade.status === "CLOSED" ||
    trade.status === "SL_HIT" ||
    trade.status === "CANCELLED"
  ) {
    return null
  }

  const safeClosePrice = round(safeNumber(closePrice), 4)

  if (!isValidPositiveNumber(safeClosePrice)) {
    return null
  }

  const result = calculateMonetaryPnl(trade, safeClosePrice)

  if (closeReason === "SL") {
    trade.status = "SL_HIT"
  } else if (closeReason === "CANCELLED") {
    trade.status = "CANCELLED"
  } else {
    trade.status = "CLOSED"
  }

  trade.closePrice = safeClosePrice
  trade.closeReason = closeReason
  trade.closedAt = new Date().toISOString()
  trade.priceChange = result.priceChange
  trade.pnl = result.pnl

  saveTradesToFile(trades)

  if (closeReason === "SL") {
    recordStopLossHit(trade.symbol)
  }

  return trade
}

export function cancelSignal(id: string): TradeRecord | null {
  const trades = loadTradesFromFile()
  const trade = trades.find((item) => item.id === id)

  if (!trade || trade.status !== "SIGNAL") {
    return null
  }

  trade.status = "CANCELLED"
  trade.closeReason = "CANCELLED"
  trade.closedAt = new Date().toISOString()
  trade.priceChange = 0
  trade.pnl = 0

  saveTradesToFile(trades)
  return trade
}

export function getOpenTradesBySymbol(symbol: string): TradeRecord[] {
  return getOpenTrades().filter((trade) => trade.symbol === symbol)
}

export function getOpenTradesByVenue(
  executionVenue: ExecutionVenue
): TradeRecord[] {
  return getOpenTrades().filter(
    (trade) => trade.executionVenue === executionVenue
  )
}

export function getOpenTradesByPriceSource(
  priceSource: PriceSource
): TradeRecord[] {
  return getOpenTrades().filter((trade) => trade.priceSource === priceSource)
}

export function getTradeStats() {
  const closedTrades = getClosedTrades().filter(
    (trade) => typeof trade.pnl === "number"
  )

  const total = closedTrades.length
  const wins = closedTrades.filter((trade) => (trade.pnl ?? 0) > 0).length
  const losses = closedTrades.filter((trade) => (trade.pnl ?? 0) < 0).length
  const breakEven = closedTrades.filter((trade) => (trade.pnl ?? 0) === 0).length

  const grossProfit = closedTrades
    .filter((trade) => (trade.pnl ?? 0) > 0)
    .reduce((sum, trade) => sum + (trade.pnl ?? 0), 0)

  const grossLoss = Math.abs(
    closedTrades
      .filter((trade) => (trade.pnl ?? 0) < 0)
      .reduce((sum, trade) => sum + (trade.pnl ?? 0), 0)
  )

  const netPnl = closedTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0)

  const averageWin = wins > 0 ? grossProfit / wins : 0
  const averageLoss = losses > 0 ? grossLoss / losses : 0
  const winRate = total > 0 ? (wins / total) * 100 : 0
  const profitFactor =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0

  return {
    total,
    wins,
    losses,
    breakEven,
    winRate: Number(winRate.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(4)),
    grossLoss: Number(grossLoss.toFixed(4)),
    netPnl: Number(netPnl.toFixed(4)),
    averageWin: Number(averageWin.toFixed(4)),
    averageLoss: Number(averageLoss.toFixed(4)),
    bestTrade:
      total > 0
        ? Number(Math.max(...closedTrades.map((trade) => trade.pnl ?? 0)).toFixed(4))
        : 0,
    worstTrade:
      total > 0
        ? Number(Math.min(...closedTrades.map((trade) => trade.pnl ?? 0)).toFixed(4))
        : 0,
    profitFactor:
      profitFactor === Infinity ? Infinity : Number(profitFactor.toFixed(2))
  }
}

export function clearAllTrades() {
  saveTradesToFile([])
}