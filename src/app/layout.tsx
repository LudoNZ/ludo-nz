import type { Metadata } from "next"
// import "./globals.css"
import "/src/styles/global.scss"
import React from "react"
import styles from "./layout.module.scss"
import { AuthProvider } from "../context/auth"
import Header from "@/components/layout/header"
import { Share_Tech_Mono } from "next/font/google"
import Head from "next/head"

export const metadata: Metadata = {
  title: "Ludo",
  description: "web developer",
  themeColor: "#1bb12f",
  icons: {
    icon: "/icons/icon-192.png",
  },
  manifest: "/manifest.json",
}

const shareTechMono = Share_Tech_Mono({
  subsets: ["latin"],
  weight: ["400"],
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <Head>
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <meta name="theme-color" content="#1bb12f" />
        <link rel="manifest" href="/manifest.json" />
      </Head>
      <body className={`${styles.layout} ${shareTechMono.className}`}>
        <AuthProvider>
          <Header />

          <div className={styles.mainContent}>{children}</div>

          <footer className={styles.footer}>
            <p>© 2025 Ludo Bourneville</p>
          </footer>
        </AuthProvider>
      </body>
    </html>
  )
}
