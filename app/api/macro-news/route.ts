import { NextResponse } from "next/server"

import {
  getMacroNews,
  getHighImpactMacroNews
} from "@/lib/macroNews"
import { summarizeMacroRisk } from "@/lib/macroFilter"

/* =========================
GET MACRO NEWS
========================= */

export async function GET() {
  try {
    console.log("FINNHUB_KEY loaded:", !!process.env.FINNHUB_KEY)

    const events = await getMacroNews()
    const highImpactEvents = await getHighImpactMacroNews()
    const summary = summarizeMacroRisk(events)

    return NextResponse.json({
      success: true,
      summary,
      total: events.length,
      highImpactTotal: highImpactEvents.length,
      events
    })
  } catch (error) {
    console.error("Macro news error:", error)

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load macro news"
      },
      { status: 500 }
    )
  }
}