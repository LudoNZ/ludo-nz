"use client"

import { useAuth } from "@/context/auth"
import styles from "./header.module.scss"
import Link from "next/link"
import Image from "next/image"

const Header = () => {
  const auth = useAuth()

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
          {!!auth?.currentUser && ( //user loged in
            <>
              <li>{`Hi ${auth.currentUser.displayName}`}</li>
              <li onClick={() => auth.logout()} className={styles.logout}>
                Logout
              </li>
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
          <li>
            <Link href={"/elements"}>Components</Link>
          </li>
        </ul>
      </nav>
    </header>
  )
}

export default Header
