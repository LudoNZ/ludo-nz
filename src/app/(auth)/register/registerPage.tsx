"use client"

import { useState, FormEvent } from "react"
import Link from "next/link"
import Button from "@/components/button/button"
import { useAuth } from "@/context/auth"
import styles from "../login/loginPage.module.scss"

const RegisterPage = () => {
  const auth = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }

    setIsSubmitting(true)
    try {
      await auth?.registerWithEmail(email, password)
    } catch (err) {
      console.error("Registration failed:", err)
      setError("Could not create account. The email may already be in use.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.authForm}>
      <h2>Register</h2>
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

        <div className={styles.formGroup}>
          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            disabled={isSubmitting}
            required
          />
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        <Button type="submit" size="large" disabled={isSubmitting} onClick={() => {}}>
          {isSubmitting ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <div className={styles.altAction}>
        Already have an account? <Link href="/login">Log in</Link>
      </div>
    </div>
  )
}

export default RegisterPage
