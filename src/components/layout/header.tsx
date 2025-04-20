"use client"

import { useAuth } from "@/context/auth"
import styles from "./header.module.scss"
import Link from "next/link"

const Header = () => {
  const auth = useAuth()

  return (
    <header className={styles.header}>
      <nav className={styles.navigation}>
        <Link href={"/"}>Home</Link>
        <ul>
          {!!auth?.currentUser && (
            <>
              <li>{`Hi ${auth.currentUser.displayName}`}</li>
              <li>{`${auth.currentUser.email}`}</li>
              <li onClick={() => auth.logout()}>Logout</li>
              <li>
                <Link href={"/elements"}>elements</Link>
              </li>
            </>
          )}
          {!auth?.currentUser && (
            <>
              <li>
                <Link href={"/login"}>login</Link>
              </li>
              <li>
                <Link href={"/register"}>register</Link>
              </li>
            </>
          )}
        </ul>
      </nav>
    </header>
  )
}

export default Header
