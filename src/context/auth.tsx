"use client"

import {
  GoogleAuthProvider,
  ParsedToken,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  User,
} from "firebase/auth"
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { auth } from "../../firebase/client"
import { canUse, FeatureId, normaliseFeatures } from "@/lib/features"
import { Access, removeToken, setToken } from "./actions"

type AuthContextType = {
  /** only set once the account's access has been checked, and never for an
   * account that was refused (not invited) */
  currentUser: User | null
  /** true until the initial auth state has been resolved (e.g. restored from a
   * previous session on page load) — guard redirects on this, not on
   * `!currentUser` alone, or a refresh will bounce a logged-in user to /login
   * during the brief window before Firebase confirms the session. */
  authLoading: boolean
  /** null when signed out (or access couldn't be determined at all) */
  access: Exclude<Access, "denied" | "unknown"> | null
  isAdmin: boolean
  /** features granted to this member (admins implicitly have all) */
  features: FeatureId[]
  hasFeature: (id: FeatureId) => boolean
  /** set when someone signs in with an account that hasn't been invited;
   * they're signed straight back out and the login page explains why */
  deniedEmail: string | null
  logout: () => Promise<void>
  /** `inviteId`: when accepting an invite from /register?invite=… */
  loginWithGoogle: (inviteId?: string | null) => Promise<void>
  loginWithEmail: (email: string, password: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  customClaims: ParsedToken | null
}

const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [customClaims, setCustomClaims] = useState<ParsedToken | null>(null)
  const [access, setAccess] = useState<AuthContextType["access"]>(null)
  const [features, setFeatures] = useState<FeatureId[]>([])
  const [deniedEmail, setDeniedEmail] = useState<string | null>(null)
  const pendingInvite = useRef<string | null>(null)

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setCurrentUser(null)
        setCustomClaims(null)
        setAccess(null)
        setFeatures([])
        try {
          await removeToken()
        } catch {
          // offline: the cookie gets cleared on the next successful sync
        }
        setAuthLoading(false)
        return
      }
      setAuthLoading(true)

      // Everything below talks to the network (a token refresh, and the
      // server action that checks the invite and mirrors the token into a
      // cookie). A failure here (most often: no connection) must not leave
      // authLoading stuck on true, which would hang every page that waits on
      // it, including the ones meant to work offline — so fall back to the
      // claims already in the token, which Firebase keeps on the device.
      let tokenResult = null
      let result: Awaited<ReturnType<typeof setToken>> | null = null
      try {
        tokenResult = await user.getIdTokenResult()
        const inviteId = pendingInvite.current
        result = await setToken({ token: tokenResult.token, refreshToken: user.refreshToken, inviteId })
        if (result.claimsUpdated) {
          tokenResult = await user.getIdTokenResult(true)
          result = await setToken({ token: tokenResult.token, refreshToken: user.refreshToken })
        }
        pendingInvite.current = null
      } catch (err) {
        console.warn("Couldn't sync the sign-in token (offline?)", err)
      }

      if (result?.access === "denied") {
        setDeniedEmail(user.email)
        await auth.signOut() // fires this listener again with null
        return
      }

      const claims = tokenResult?.claims ?? null
      let resolvedAccess: AuthContextType["access"] = null
      let resolvedFeatures: FeatureId[] = []
      if (result && result.access !== "unknown") {
        resolvedAccess = result.access
        resolvedFeatures = result.features
      } else if (claims?.admin) {
        resolvedAccess = "admin"
      } else if (Array.isArray(claims?.features)) {
        resolvedAccess = "member"
        resolvedFeatures = normaliseFeatures(claims.features as unknown[])
      }

      setDeniedEmail(null)
      setCustomClaims(claims)
      setAccess(resolvedAccess)
      setFeatures(resolvedFeatures)
      setCurrentUser(user)
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const logout = async () => {
    await auth.signOut()
  }

  const loginWithGoogle = async (inviteId?: string | null) => {
    pendingInvite.current = inviteId ?? null
    setDeniedEmail(null)
    await signInWithPopup(auth, new GoogleAuthProvider())
  }

  const loginWithEmail = async (email: string, password: string) => {
    setDeniedEmail(null)
    await signInWithEmailAndPassword(auth, email, password)
  }

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email)
  }

  const isAdmin = access === "admin"
  const hasFeature = useCallback((id: FeatureId) => canUse(id, features, isAdmin), [features, isAdmin])

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        authLoading,
        access,
        isAdmin,
        features,
        hasFeature,
        deniedEmail,
        logout,
        loginWithGoogle,
        loginWithEmail,
        resetPassword,
        customClaims,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
