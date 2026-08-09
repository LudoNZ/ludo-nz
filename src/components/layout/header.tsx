"use client"

import { useAuth } from "@/context/auth"
import styles from "./header.module.scss"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
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

        <ul className={styles.navLinks}>
          <li>
            <Link href={"/"}>Home</Link>
          </li>
          <li>
            <Link href={"/about"}>About</Link>
          </li>
          <li>
            <Link href={"/projects"}>Projects</Link>
          </li>
          <li>
            <Link href={"/contact"}>Contact</Link>
          </li>
          <li>
            <Link href={"/dice"}>Dice</Link>
          </li>
          <li>
            <Link href={"/menu"}>Menu</Link>
          </li>
          {!!auth &&
            !!auth.currentUser && ( //user loged in
              <>
                <li>
                  <Link href={"/exercise"}>Exercise</Link>
                </li>
                <li>
                  <Link href={"/decking"}>Decking</Link>
                </li>
                <li className={styles.authLink}>{`Hi ${auth.currentUser.displayName}`}</li>
                <LogoutButton />
              </>
            )}
          {!auth?.currentUser && auth?.authLoading === false && ( // anonymous visitor (once auth state is resolved)
            <>
              <li className={styles.authLink}>
                <Link href={"/login"}>Login</Link>
              </li>
            </>
          )}
          {auth && !!auth.customClaims?.admin && (
            <li className={styles.authLink}>
              <Link href={"/admin-dashboard"}>Admin</Link>
            </li>
          )}
        </ul>
      </nav>
    </header>
  )
}

export default Header
