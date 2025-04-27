"use client"

import React from "react"
import styles from "./indexPage.module.scss"
import Link from "next/link"

const IndexPage: React.FC = () => {
  return (
    <div className={styles.indexPage}>
      <h1>Hi I'm Ludo</h1>
      <Intro />
      <TechStack />
      <h4>Website in development..... Content to come</h4>
    </div>
  )
}

const Intro = () => {
  return (
    <div>
      <h3>Front-end Web Developer with a Construction Edge</h3>
      <Link href={"/"}>See my work</Link> <Link href={"/"}>Contact Me</Link>
    </div>
  )
}

const TechStack = () => {
  return (
    <div>
      <h3>Tech I Use</h3>
      <p>React | Next.js | Typescript | Scala | Laminar</p>
    </div>
  )
}

export default IndexPage
