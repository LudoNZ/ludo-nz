"use client"

import { useAuth } from "@/context/auth"
import styles from "./header.module.scss"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/router"
import React from "react"

const Header = () => {
  const auth = useAuth()

  const LogoutButton: React.FC = () => {
    const router = useRouter()

    const handleLogout = () => {
      auth?.logout()
      router.push("/")
    }

    return (
      <li onClick={() => handleLogout()} className={styles.logout}>
        Logout
      </li>
    )
  }

  return (
    <header className={styles.header}>
      <nav className={styles.navigation}>
        <Link href={"/"} className={styles.logoBox}>
          <Image
            className={styles.logo}
            fill
            src={"/logo.svg"}
            alt="Logo"
          ></Image>
        </Link>

        <ul>
          {!!auth &&
            !!auth.currentUser && ( //user loged in
              <>
                <li>{`Hi ${auth.currentUser.displayName}`}</li>
                <LogoutButton />
              </>
            )}
          {!auth?.currentUser && ( // anonymous visitor
            <>
              <li>
                <Link href={"/login"}>login</Link>
              </li>
              <li>
                <Link href={"/register"}>register</Link>
              </li>
            </>
          )}
          {auth && !!auth.customClaims?.admin && <li>Admin</li>}
          <li>
            <Link href={"/elements"}>Components</Link>
          </li>
        </ul>
      </nav>
    </header>
  )
}

export default Header
