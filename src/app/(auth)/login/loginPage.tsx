"use client"

import Button from "@/components/button/button"
import { useAuth } from "@/context/auth"

const LoginPage = () => {
  const auth = useAuth()

  return (
    <div>
      <h2>login Page</h2>
      <Button
        size="large"
        onClick={() => {
          auth?.loginWithGoogle()
        }}
      >
        Continue with Google
      </Button>
    </div>
  )
}

export default LoginPage
