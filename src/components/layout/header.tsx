"use client"

import { useAuth } from "@/context/auth"
import styles from "./header.module.scss"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import React from "react"
import { FEATURES } from "@/lib/features"
import { useSiteAccess } from "@/context/siteAccess"

const Header = () => {
  const auth = useAuth()
  const siteAccess = useSiteAccess()

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
          {FEATURES.filter((f) => siteAccess[f.id] === "public" || (auth?.currentUser && auth.hasFeature(f.id))).map((f) => (
            <li key={f.id}>
              <Link href={f.href}>{f.label}</Link>
            </li>
          ))}
          {auth?.isAdmin && (
            <li className={styles.authLink}>
              <Link href={"/admin-dashboard"}>Admin</Link>
            </li>
          )}
          {!!auth?.currentUser && (
            <>
              <li className={styles.authLink}>{`Hi ${auth.currentUser.displayName || auth.currentUser.email}`}</li>
              <LogoutButton />
            </>
          )}
          {!auth?.currentUser && auth?.authLoading === false && ( // anonymous visitor (once auth state is resolved)
            <li className={styles.authLink}>
              <Link href={"/login"}>Login</Link>
            </li>
          )}
        </ul>
      </nav>
    </header>
  )
}

export default Header
