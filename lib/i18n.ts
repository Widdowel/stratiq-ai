export type AppLanguage = "fr" | "en"

export const messages = {
  fr: {
    common: {
      refresh: "Actualiser",
      loading: "Chargement...",
      backHome: "← Retour à l'accueil",
      noData: "Aucune donnée",
      news: "Actualités",
      trades: "Trades",
      scanner: "Scanner",
      execute: "Exécuter",
      executed: "Déjà exécuté",
      period: "Période",
      from: "Du",
      to: "Au",
      notes: "Notes",
      reason: "Raison",
      actual: "Actuel",
      previous: "Précédent",
      forecast: "Prévision",
      country: "Pays",
      currency: "Devise",
      time: "Heure",
      entry: "Entrée",
      actualEntry: "Entrée réelle",
      closePrice: "Prix de clôture",
      currentPrice: "Prix actuel",
      quantity: "Quantité",
      confidence: "Confiance",
      positionSize: "Taille position",
      leverage: "Levier",
      marginMode: "Mode marge",
      accountCurrency: "Devise du compte",
      priceSource: "Source prix",
      executionVenue: "Plateforme d'exécution",
      noResults: "Aucun résultat"
    },
    home: {
      title: "STRATIQ-2 Market Scanner",
      subtitle:
        "Scanne crypto, forex et gold, suit le risque macro et exécute tes trades depuis un seul dashboard.",
      shortScan: "SCAN COURT",
      mediumScan: "SCAN MOYEN",
      longScan: "SCAN LONG",
      noSignals: "Aucun signal trouvé",
      openTradesTracker: "TRACKER DES TRADES",
      newsAlerts: "ALERTES NEWS",
      aiDashboard: "DASHBOARD TRADING IA",
      confidenceLabel: "Confiance",
      positionLabel: "Position",
      macroRisk: "Risque Macro",
      macroNote: "Note Macro",
      relatedMacroEvents: "Événements Macro Liés",
      takeProfit: "TAKE PROFIT",
      stopLoss: "STOP LOSS",
      scanning: "Scan en cours...",
      invalidScannerResponse: "Réponse scanner invalide",
      scanFailed: "Scan impossible",
      unableToScan: "Impossible de scanner les marchés",
      executing: "EXÉCUTION...",
      invalidVenue: "Venue invalide",
      invalidTradeResponse: "API /api/trades/open a retourné une réponse invalide",
      unableToExecute: "Impossible d'exécuter le signal",
      executedTrade: "Trade exécuté"
    },
    trades: {
      title: "Trades Tracker",
      performance: "Dashboard de Performance",
      openTrades: "Trades Ouverts",
      closedTrades: "Trades Fermés",
      signals: "Signaux",
      noOpenTrades: "Aucun trade ouvert",
      noClosedTrades: "Aucun trade fermé",
      noSignals: "Aucun signal stocké",
      backToScanner: "← RETOUR AU SCANNER",
      refreshTracker: "ACTUALISER LE TRACKER",
      updatingLivePrices: "Mise à jour des prix live...",
      loadingPerformance: "Chargement performance...",
      noPerformance: "Aucune donnée de performance",
      activeFilter: "Filtre actif",
      today: "AUJOURD'HUI",
      thisMonth: "CE MOIS",
      custom: "PERSONNALISÉ",
      periodNetPnl: "PnL période",
      winRate: "Taux de réussite",
      netProfit: "Profit net",
      maxDrawdown: "Drawdown max",
      closedTradesCount: "Trades fermés",
      performanceBySymbol: "Performance par symbole",
      loadingOpenTrades: "Chargement des trades ouverts...",
      loadingClosedTrades: "Chargement des trades fermés...",
      loadingSignals: "Chargement des signaux...",
      noClosedTradesForPeriod: "Aucun trade fermé pour la période sélectionnée",
      floating: "Flottant",
      realized: "Réalisé",
      lot: "Lot",
      marginUsed: "Marge utilisée",
      priceChange: "Variation prix",
      floatingPnl: "PnL flottant",
      realizedPnl: "PnL réalisé",
      opened: "Ouvert",
      closed: "Fermé"
    },
    news: {
      title: "Macro News & Alerts",
      refreshNews: "ACTUALISER LES NEWS",
      macroEvents: "Événements Macro du Jour",
      recommendations: "Recommandations Trader",
      todayRisk: "RISQUE DU JOUR",
      intelligence: "NEWS & INTELLIGENCE MACRO",
      subtitle:
        "Surveille les événements macro-économiques, le risque du jour et les recommandations trading avant d'entrer sur le marché.",
      loadingNews: "Chargement des news macro...",
      invalidApiResponse: "Réponse API invalide",
      unableToLoad: "Impossible de charger les news",
      riskOverview: "Vue d'ensemble du risque macro",
      noSummary: "Aucun résumé macro disponible pour le moment.",
      noEvents: "Aucun événement macro disponible aujourd'hui.",
      noRecommendations: "Aucune recommandation disponible pour le moment.",
      noDescription: "Aucune description disponible pour cet événement.",
      eventsCount: "événements"
    }
  },

  en: {
    common: {
      refresh: "Refresh",
      loading: "Loading...",
      backHome: "← Back to home",
      noData: "No data",
      news: "News",
      trades: "Trades",
      scanner: "Scanner",
      execute: "Execute",
      executed: "Already executed",
      period: "Period",
      from: "From",
      to: "To",
      notes: "Notes",
      reason: "Reason",
      actual: "Actual",
      previous: "Previous",
      forecast: "Forecast",
      country: "Country",
      currency: "Currency",
      time: "Time",
      entry: "Entry",
      actualEntry: "Actual Entry",
      closePrice: "Close Price",
      currentPrice: "Current Price",
      quantity: "Quantity",
      confidence: "Confidence",
      positionSize: "Position Size",
      leverage: "Leverage",
      marginMode: "Margin Mode",
      accountCurrency: "Account Currency",
      priceSource: "Price Source",
      executionVenue: "Execution Venue",
      noResults: "No results"
    },
    home: {
      title: "STRATIQ-2 Market Scanner",
      subtitle:
        "Scan crypto, forex and gold setups, track macro risk, and execute your trades from one dashboard.",
      shortScan: "SHORT SCAN",
      mediumScan: "MEDIUM SCAN",
      longScan: "LONG SCAN",
      noSignals: "No signals found",
      openTradesTracker: "OPEN TRADES TRACKER",
      newsAlerts: "NEWS ALERTS",
      aiDashboard: "AI TRADING DASHBOARD",
      confidenceLabel: "Confidence",
      positionLabel: "Position",
      macroRisk: "Macro Risk",
      macroNote: "Macro Note",
      relatedMacroEvents: "Related Macro Events",
      takeProfit: "TAKE PROFIT",
      stopLoss: "STOP LOSS",
      scanning: "Scanning...",
      invalidScannerResponse: "Invalid scanner response",
      scanFailed: "Scan failed",
      unableToScan: "Unable to scan markets",
      executing: "EXECUTING...",
      invalidVenue: "Invalid execution venue",
      invalidTradeResponse: "API /api/trades/open returned invalid response",
      unableToExecute: "Unable to execute signal",
      executedTrade: "Trade executed"
    },
    trades: {
      title: "Trades Tracker",
      performance: "Performance Dashboard",
      openTrades: "Open Trades",
      closedTrades: "Closed Trades",
      signals: "Signals",
      noOpenTrades: "No open trades",
      noClosedTrades: "No closed trades",
      noSignals: "No stored signals",
      backToScanner: "← BACK TO SCANNER",
      refreshTracker: "REFRESH TRACKER",
      updatingLivePrices: "Updating live prices...",
      loadingPerformance: "Loading performance...",
      noPerformance: "No performance data yet",
      activeFilter: "Active filter",
      today: "TODAY",
      thisMonth: "THIS_MONTH",
      custom: "CUSTOM",
      periodNetPnl: "Period Net PnL",
      winRate: "Win Rate",
      netProfit: "Net Profit",
      maxDrawdown: "Max Drawdown",
      closedTradesCount: "Closed Trades",
      performanceBySymbol: "Performance by Symbol",
      loadingOpenTrades: "Loading open trades...",
      loadingClosedTrades: "Loading closed trades...",
      loadingSignals: "Loading signals...",
      noClosedTradesForPeriod: "No closed trades for selected period",
      floating: "Floating",
      realized: "Realized",
      lot: "Lot",
      marginUsed: "Margin Used",
      priceChange: "Price Change",
      floatingPnl: "Floating PnL",
      realizedPnl: "Realized PnL",
      opened: "Opened",
      closed: "Closed"
    },
    news: {
      title: "Macro News & Alerts",
      refreshNews: "REFRESH NEWS",
      macroEvents: "Macro Events of the Day",
      recommendations: "Trader Recommendations",
      todayRisk: "TODAY RISK",
      intelligence: "NEWS & MACRO INTELLIGENCE",
      subtitle:
        "Monitor macro-economic events, daily risk conditions and trading recommendations before entering the market.",
      loadingNews: "Loading macro news...",
      invalidApiResponse: "Invalid API response",
      unableToLoad: "Unable to load news",
      riskOverview: "Macro risk overview",
      noSummary: "No macro summary available for now.",
      noEvents: "No macro events available today.",
      noRecommendations: "No recommendations available yet.",
      noDescription: "No description available for this event.",
      eventsCount: "events"
    }
  }
} as const

/**
 * Safe getter
 */
export function getNestedValue(obj: any, path: string) {
  try {
    return path.split(".").reduce((acc, key) => acc?.[key], obj)
  } catch {
    return undefined
  }
}

/**
 * Translator factory
 */
export function createTranslator(lang: AppLanguage) {
  return function t(path: string): string {
    const value = getNestedValue(messages[lang], path)

    if (!value) {
      console.warn(`Missing translation: ${path}`)
      return path
    }

    return value
  }
}