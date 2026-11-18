"use client"

import { useState, FormEvent, useEffect } from "react"
import { useRouter } from "next/navigation"
import Button from "@/components/button/button"
import { useAuth } from "@/context/auth"
import styles from "./loginPage.module.scss"

/** Where to go once signed in: ?next=/some/path (set by FeatureGate), only
 * ever a path on this site. */
function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next")
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/"
}

const LoginPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const signedIn = !!auth?.currentUser
  useEffect(() => {
    if (signedIn) router.replace(nextPath())
  }, [signedIn, router])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
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

  const handleGoogle = async () => {
    setError(null)
    setNotice(null)
    try {
      await auth?.loginWithGoogle()
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        console.error("Google login failed:", err)
        setError("Google sign-in didn't work. Try again.")
      }
    }
  }

  const handleReset = async () => {
    setError(null)
    setNotice(null)
    if (!email) {
      setError("Enter your email above first, then press \"Forgot password\" again.")
      return
    }
    try {
      await auth?.resetPassword(email)
    } catch (err) {
      console.warn("Password reset failed:", err)
    }
    // same message either way, so this can't be used to probe which emails have accounts
    setNotice(`If there's an account for ${email}, a password reset link is on its way.`)
  }

  const checking = isSubmitting || (!!auth?.authLoading && !signedIn)

  return (
    <div className={styles.authForm}>
      <h2>Log in</h2>

      {auth?.deniedEmail && (
        <div className={styles.errorMessage}>
          {auth.deniedEmail} hasn&apos;t been invited. Logins are invite only for now. If you&apos;ve been sent an invite
          link, open that link to set up your account.
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            autoComplete="email"
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={isSubmitting}
            required
          />
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}
        {notice && <div className={styles.noticeMessage}>{notice}</div>}

        <Button type="submit" size="large" disabled={checking} onClick={() => {}}>
          {checking ? "Logging in..." : "Log in"}
        </Button>
        <button type="button" className={styles.linkButton} onClick={handleReset}>
          Forgot password?
        </button>
      </form>

      <div className={styles.divider}>or</div>

      <Button size="large" variant="secondary" disabled={checking} onClick={handleGoogle}>
        Continue with Google
      </Button>

      <div className={styles.altAction}>Accounts are invite only. Use the link in your invite to get started.</div>
    </div>
  )
}

export default LoginPage
