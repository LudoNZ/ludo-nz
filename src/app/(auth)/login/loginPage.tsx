"use client"

import Button from "@/components/button/button"
import { useAuth } from "@/context/auth"

const LoginPage = () => {
  const auth = useAuth()

  return (
    <div>
      <h2>login Page</h2>
      <Button
        children="Continue with Google"
        size="large"
        onClick={() => {
          auth?.loginWithGoogle()
        }}
      />
    </div>
  )
}

export default LoginPage
