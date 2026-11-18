import type { Metadata } from "next"
// import "./globals.css"
import "/src/styles/global.scss"
import React from "react"
import styles from "./layout.module.scss"
import { AuthProvider } from "../context/auth"
import Header from "@/components/layout/header"
import { SiteAccessProvider } from "@/context/siteAccess"
import { getSiteAccess } from "@/lib/siteAccess.server"
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

// Safety net for the cached site access settings: pages re-check them at
// most hourly even if a save's revalidation were missed. Saving in the admin
// dashboard refreshes them straight away.
export const revalidate = 3600

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const siteAccess = await getSiteAccess()
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" type="image/x-icon" />
        <meta name="theme-color" content="#137a22" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={`${styles.layout} ${shareTechMono.className}`}>
        <SiteAccessProvider value={siteAccess}>
          <AuthProvider>
            <Header />

            <div className={styles.mainContent}>{children}</div>

            <footer className={styles.footer}>
              <p>© 2025 Ludo Bourneville</p>
            </footer>
          </AuthProvider>
        </SiteAccessProvider>
      </body>
    </html>
  )
}
