"use client"

import { useState, FormEvent } from "react"
import Link from "next/link"
import Button from "@/components/button/button"
import { useAuth } from "@/context/auth"
import styles from "./loginPage.module.scss"

const LoginPage = () => {
  const auth = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await auth?.loginWithEmail(email, password)
    } catch (err) {
      console.error("Login failed:", err)
      setError("Invalid email or password.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.authForm}>
      <h2>Log in</h2>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={isSubmitting}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={isSubmitting}
            required
          />
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        <Button type="submit" size="large" disabled={isSubmitting} onClick={() => {}}>
          {isSubmitting ? "Logging in..." : "Log in"}
        </Button>
      </form>

      <div className={styles.divider}>or</div>

      <Button
        size="large"
        variant="secondary"
        onClick={() => {
          auth?.loginWithGoogle()
        }}
      >
        Continue with Google
      </Button>

      <div className={styles.altAction}>
        No account yet? <Link href="/register">Register</Link>
      </div>
    </div>
  )
}

export default LoginPage
