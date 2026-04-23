"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage("")

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <div className="container-app" style={{ padding: "24px" }}>
      <div className="card-glass" style={{ maxWidth: 460, margin: "0 auto", padding: 24 }}>
        <h1 style={{ marginBottom: 16 }}>Login</h1>

        <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? "Connecting..." : "Login"}
          </button>
        </form>

        {message && <p style={{ marginTop: 12 }}>{message}</p>}

        <div style={{ marginTop: 16 }}>
          <Link href="/signup">Create account</Link>
        </div>
      </div>
    </div>
  )
}