"use client"

import { useState, FormEvent, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Button from "@/components/button/button"
import { useAuth } from "@/context/auth"
import { acceptInviteWithPassword, getInvite } from "@/context/actions"
import styles from "../login/loginPage.module.scss"

type Invite = { email: string; name: string | null }

/** Accepting an invite: /register?invite=<id>, the link the admin
 * dashboard hands out. Either choose a password (the account is created
 * server side, only for the invited address), or continue with Google
 * (any Google account; the invite binds to it). Without a valid invite
 * there's nothing to register for. */
const RegisterPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [inviteId, setInviteId] = useState<string | null>(null)
  const [invite, setInvite] = useState<Invite | null | "loading">("loading")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("invite")
    setInviteId(id)
    if (!id) {
      setInvite(null)
      return
    }
    getInvite(id)
      .then((inv) => {
        setInvite(inv)
        if (inv?.name) setName(inv.name)
      })
      .catch(() => setInvite(null))
  }, [])

  const signedIn = !!auth?.currentUser
  useEffect(() => {
    if (signedIn) router.replace("/")
  }, [signedIn, router])

  if (invite === "loading") {
    return (
      <div className={styles.authForm}>
        <h2>Accept invite</h2>
        <p>Checking your invite...</p>
      </div>
    )
  }

  if (!invite || !inviteId) {
    return (
      <div className={styles.authForm}>
        <h2>Invite only</h2>
        <p>
          {inviteId
            ? "This invite link has already been used or is no longer valid."
            : "Accounts on this site are by invite only for now."}
        </p>
        <div className={styles.altAction}>
          Already set up? <Link href="/login">Log in</Link>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    setIsSubmitting(true)
    try {
      const result = await acceptInviteWithPassword({ inviteId, name, password })
      if (!result.ok) {
        setError(result.error)
        return
      }
      await auth?.loginWithEmail(result.email, password)
    } catch (err) {
      console.error("Accepting invite failed:", err)
      setError("Couldn't set up your account. Try again in a moment.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogle = async () => {
    setError(null)
    try {
      await auth?.loginWithGoogle(inviteId)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        console.error("Google sign-in failed:", err)
        setError("Google sign-in didn't work. Try again.")
      }
    }
  }

  const busy = isSubmitting || (!!auth?.authLoading && !signedIn)

  return (
    <div className={styles.authForm}>
      <h2>Accept invite</h2>
      <p>You&apos;ve been invited as</p>
      <p className={styles.readonlyEmail}>{invite.email}</p>

      <div className={styles.divider}>continue with Google</div>
      <Button size="large" variant="secondary" disabled={busy} onClick={handleGoogle}>
        Continue with Google
      </Button>

      <div className={styles.divider}>or choose a password</div>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGroup}>
          <label htmlFor="name">Your name</label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="at least 8 characters"
            disabled={busy}
            required
          />
        </div>
        <div className={styles.formGroup}>
          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={busy}
            required
          />
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        <Button type="submit" size="large" disabled={busy} onClick={() => {}}>
          {busy ? "Setting up..." : "Create account"}
        </Button>
      </form>
    </div>
  )
}

export default RegisterPage
