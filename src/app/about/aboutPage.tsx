"use client"

import React from "react"
import styles from "./aboutPage.module.scss"

const AboutPage: React.FC = () => {
  return (
    <div className={styles.aboutPage}>
      <section className={styles.hero}>
        <h1 className={styles.title}>About Me</h1>
        <p className={styles.subtitle}>
          Front-end Web Developer with a Construction Edge
        </p>
      </section>

      <section className={styles.content}>
        <div className={styles.bio}>
          <h2>Who I Am</h2>
          <p>
            I&apos;m a front-end web developer passionate about building modern, user-friendly 
            web applications. With a background in construction, I bring a unique perspective 
            to software development, understanding the real-world challenges that industries 
            face and how technology can solve them.
          </p>
          <p>
            My journey in web development has been driven by a desire to create solutions 
            that make a difference. I specialize in building responsive, performant applications 
            using modern web technologies, with a particular focus on construction and project 
            management tools.
          </p>
        </div>

        <div className={styles.skills}>
          <h2>Skills & Technologies</h2>
          <div className={styles.skillsGrid}>
            <div className={styles.skillCategory}>
              <h3>Frontend Development</h3>
              <ul>
                <li>React</li>
                <li>Next.js</li>
                <li>TypeScript</li>
                <li>JavaScript (ES6+)</li>
                <li>SCSS/CSS Modules</li>
                <li>Responsive Design</li>
              </ul>
            </div>
            <div className={styles.skillCategory}>
              <h3>Backend & Services</h3>
              <ul>
                <li>Firebase</li>
                <li>Firestore</li>
                <li>Firebase Authentication</li>
                <li>Firebase Hosting</li>
                <li>Node.js</li>
              </ul>
            </div>
            <div className={styles.skillCategory}>
              <h3>Other Technologies</h3>
              <ul>
                <li>Scala</li>
                <li>Laminar</li>
                <li>Git</li>
                <li>Web Performance</li>
                <li>Progressive Web Apps</li>
              </ul>
            </div>
          </div>
        </div>

        <div className={styles.experience}>
          <h2>Background</h2>
          <p>
            My experience in the construction industry has given me valuable insights into 
            project management, workflow optimization, and the specific needs of contractors. 
            This background informs my approach to building software solutions that are 
            practical, efficient, and tailored to real-world use cases.
          </p>
          <p>
            I&apos;m always learning and staying up-to-date with the latest web technologies and 
            best practices. Whether it&apos;s exploring new frameworks, optimizing performance, 
            or improving user experience, I&apos;m committed to delivering high-quality solutions.
          </p>
        </div>

        <div className={styles.cta}>
          <h2>Let&apos;s Work Together</h2>
          <p>
            Interested in collaborating on a project or have a question? 
            Feel free to <a href="/contact">get in touch</a>.
          </p>
        </div>
      </section>
    </div>
  )
}

export default AboutPage
