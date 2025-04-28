"use client"

import React from "react"
import styles from "./indexPage.module.scss"
import Link from "next/link"
import Image from "next/image"

const IndexPage: React.FC = () => {
  return (
    <div className={styles.indexPage}>
      <h1>Welcome to Ludo.co.nz</h1>

      <div className={styles.intro}>
        <h3>Front-end Web Developer with a Construction Edge</h3>
        <Link href={"/"}>See my work</Link> | <Link href={"/"}>Contact Me</Link>
      </div>

      <div className={styles.techStack}>
        <h3>Tech I Use</h3>
        <p>React | Next.js | Typescript | Scala | Laminar</p>
      </div>

      <div className={styles.logo}>
        <div className={styles.mainLogo}>
          <Image fill src={"/logo.svg"} alt="Logo"></Image>
        </div>
        <h2 className={styles.heroText}>Ludo - Building the Web</h2>
      </div>

      <h4>Website currently in construction..... Content to come</h4>
    </div>
  )
}

export default IndexPage
