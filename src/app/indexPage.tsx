"use client"

import React from "react"
import styles from "./indexPage.module.scss"
import Link from "next/link"
import Image from "next/image"

const IndexPage: React.FC = () => {
  return (
    <div className={styles.indexPage}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.logo}>
            <div className={styles.mainLogo}>
              <Image fill src={"/logo.svg"} alt="Logo"></Image>
            </div>
          </div>
          <h1 className={styles.heroTitle}>Ludo Bourneville</h1>
          <h2 className={styles.heroSubtitle}>Front-end Web Developer with a Construction Edge</h2>
          <p className={styles.heroDescription}>
            Building modern web applications and construction management solutions
          </p>
          <div className={styles.ctaButtons}>
            <Link href={"/projects"} className={styles.ctaPrimary}>
              View My Work
            </Link>
            <Link href={"/contact"} className={styles.ctaSecondary}>
              Get In Touch
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.featuredProject}>
        <h2 className={styles.sectionTitle}>Featured Project</h2>
        <div className={styles.projectCard}>
          <h3 className={styles.projectTitle}>Construction Project Management App</h3>
          <p className={styles.projectDescription}>
            A comprehensive project management solution designed specifically for Main contractors, 
            streamlining construction workflows and improving project coordination.
          </p>
          <div className={styles.projectTech}>
            <span className={styles.techTag}>React</span>
            <span className={styles.techTag}>Next.js</span>
            <span className={styles.techTag}>TypeScript</span>
            <span className={styles.techTag}>Firebase</span>
          </div>
          <Link href={"/projects/construction-pm"} className={styles.projectLink}>
            Learn More →
          </Link>
        </div>
      </section>

      <section className={styles.techStack}>
        <h2 className={styles.sectionTitle}>Technologies I Work With</h2>
        <div className={styles.techGrid}>
          <div className={styles.techItem}>
            <h4>Frontend</h4>
            <p>React | Next.js | TypeScript</p>
          </div>
          <div className={styles.techItem}>
            <h4>Backend</h4>
            <p>Firebase | Node.js</p>
          </div>
          <div className={styles.techItem}>
            <h4>Languages</h4>
            <p>TypeScript | JavaScript | Scala</p>
          </div>
          <div className={styles.techItem}>
            <h4>Tools</h4>
            <p>SCSS | Git | Firebase Hosting</p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default IndexPage
