import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        }
      }
    }
  )

  const {
    data: { user }
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  const publicPaths = ["/login", "/signup", "/risk-disclosure"]
  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )

  const isProtectedPath =
    pathname === "/" ||
    pathname.startsWith("/news") ||
    pathname.startsWith("/trades") ||
    pathname.startsWith("/api/news") ||
    pathname.startsWith("/api/trades") ||
    pathname.startsWith("/api/market-scan") ||
    pathname.startsWith("/api/live-prices")

  if (!user && isProtectedPath) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (user && isPublicPath) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return response
}

export const config = {
  matcher: [
    "/",
    "/news/:path*",
    "/trades/:path*",
    "/login",
    "/signup",
    "/risk-disclosure",
    "/api/news/:path*",
    "/api/trades/:path*",
    "/api/market-scan/:path*",
    "/api/live-prices/:path*"
  ]
}