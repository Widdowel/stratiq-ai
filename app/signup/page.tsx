"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

export default function SignupPage() {
  const supabase = createClient()
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage("")

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setMessage("Check your email to confirm your account.")
    setLoading(false)
  }

  return (
    <div className="container-app" style={{ padding: "24px" }}>
      <div className="card-glass" style={{ maxWidth: 460, margin: "0 auto", padding: 24 }}>
        <h1 style={{ marginBottom: 16 }}>Create account</h1>

        <form onSubmit={handleSignup} style={{ display: "grid", gap: 12 }}>
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
            {loading ? "Creating..." : "Sign up"}
          </button>
        </form>

        {message && <p style={{ marginTop: 12 }}>{message}</p>}

        <div style={{ marginTop: 16 }}>
          <Link href="/login">Already have an account? Log in</Link>
        </div>
      </div>
    </div>
  )
}