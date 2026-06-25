"use server"

import { cookies } from "next/headers"
import { getAuthAdmin } from "../../firebase/server"

export const removeToken = async () => {
  const cookieStore = await cookies()
  cookieStore.delete("firebaseAuthToken")
  cookieStore.delete("firebaseAuthRefreshToken")
}

export const setToken = async ({
  token,
  refreshToken,
}: {
  token: string
  refreshToken: string
}): Promise<{ claimsUpdated: boolean }> => {
  try {
    const auth = getAuthAdmin()
    const verifiedToken = await auth.verifyIdToken(token)

    if (!verifiedToken) {
      return { claimsUpdated: false }
    }

    let claimsUpdated = false
    const userRecord = await auth.getUser(verifiedToken.uid)
    if (process.env.ADMIN_EMAIL === userRecord.email && !userRecord.customClaims?.admin) {
      await auth.setCustomUserClaims(verifiedToken.uid, {
        admin: true,
      })
      claimsUpdated = true
    }

    const cookieStore = await cookies()
    cookieStore.set("firebaseAuthToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    })
    cookieStore.set("firebaseAuthRefreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    })

    return { claimsUpdated }
  } catch (e) {
    console.log(e)
    return { claimsUpdated: false }
  }
}
