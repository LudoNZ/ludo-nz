"use client"

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  ParsedToken,
  signInWithEmailAndPassword,
  signInWithPopup,
  User,
} from "firebase/auth"
import { createContext, useContext, useEffect, useState } from "react"
import { auth } from "../../firebase/client"
import { removeToken, setToken } from "./actions"

type AuthContextType = {
  currentUser: User | null
  /** true until the initial auth state has been resolved (e.g. restored from a
   * previous session on page load) — guard redirects on this, not on
   * `!currentUser` alone, or a refresh will bounce a logged-in user to /login
   * during the brief window before Firebase confirms the session. */
  authLoading: boolean
  logout: () => Promise<void>
  loginWithGoogle: () => Promise<void>
  loginWithEmail: (email: string, password: string) => Promise<void>
  registerWithEmail: (email: string, password: string) => Promise<void>
  customClaims: ParsedToken | null
}

const AuthContext = createContext<AuthContextType | null>(null)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [customClaims, setCustomClaims] = useState<ParsedToken | null>(null)

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user ?? null)
      if (user) {
        let tokenResult = await user.getIdTokenResult()
        let token = tokenResult.token
        const refreshToken = user.refreshToken
        if (token && refreshToken) {
          const { claimsUpdated } = await setToken({ token, refreshToken })
          if (claimsUpdated) {
            tokenResult = await user.getIdTokenResult(true)
            token = tokenResult.token
            await setToken({ token, refreshToken })
          }
        }
        setCustomClaims(tokenResult.claims ?? null)
      } else {
        await removeToken()
      }
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const logout = async () => {
    await auth.signOut()
  }

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
  }

  const loginWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const registerWithEmail = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password)
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        authLoading,
        logout,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        customClaims,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
