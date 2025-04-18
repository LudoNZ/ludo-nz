"use client"

import Button from "@/components/button/button"
import { signInWithPopup } from "firebase/auth"
import { GoogleAuthProvider } from "firebase/auth"
import { auth } from "../../../../firebase/client"

const LoginPage = () => {
  return (
    <div>
      <h2>login Page</h2>
      <Button
        children="Conitnue with Google"
        size="large"
        onClick={() => {
          const provider = new GoogleAuthProvider()
          signInWithPopup(auth, provider)
        }}
      />
    </div>
  )
}

export default LoginPage
