import type { Metadata } from "next"
// import "./globals.css"
import "/src/styles/global.scss"
import React from "react"
import styles from "./layout.module.scss"
import { AuthProvider } from "../context/auth"
import Header from "@/components/layout/header"
import { Share_Tech_Mono } from "next/font/google"

export const metadata: Metadata = {
  title: "Ludo Bourneville - Front-end Web Developer",
  description:
    "Front-end web developer specializing in React, Next.js, and TypeScript. Building modern web applications and construction project management solutions.",
  keywords: [
    "web developer",
    "front-end developer",
    "React",
    "Next.js",
    "TypeScript",
    "construction software",
    "project management",
    "Firebase",
  ],
  authors: [{ name: "Ludo Bourneville" }],
  creator: "Ludo Bourneville",
  openGraph: {
    title: "Ludo Bourneville - Front-end Web Developer",
    description:
      "Front-end web developer specializing in React, Next.js, and TypeScript. Building modern web applications and construction project management solutions.",
    type: "website",
    locale: "en_NZ",
    siteName: "Ludo.co.nz",
  },
  twitter: {
    card: "summary",
    title: "Ludo Bourneville - Front-end Web Developer",
    description:
      "Front-end web developer specializing in React, Next.js, and TypeScript.",
  },
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
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <meta name="theme-color" content="#1bb12f" />
        <link rel="manifest" href="/manifest.json" />
      </head>
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
