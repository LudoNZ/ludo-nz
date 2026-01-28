"use client"

import React from "react"
import styles from "./constructionPmPage.module.scss"
import Link from "next/link"

const ConstructionPmPage: React.FC = () => {
  const features = [
    {
      title: "Project Overview",
      description:
        "Comprehensive dashboard providing real-time insights into project status, timelines, and key metrics.",
    },
    {
      title: "Contractor Management",
      description:
        "Streamlined management of subcontractors, suppliers, and team members with role-based access control.",
    },
    {
      title: "Task & Schedule Tracking",
      description:
        "Advanced scheduling tools to manage tasks, deadlines, and dependencies across multiple projects.",
    },
    {
      title: "Document Management",
      description:
        "Centralized repository for project documents, plans, permits, and compliance records.",
    },
    {
      title: "Budget & Cost Control",
      description:
        "Track expenses, manage budgets, and monitor cost overruns with detailed financial reporting.",
    },
    {
      title: "Communication Hub",
      description:
        "Integrated communication tools to keep all stakeholders informed and aligned throughout the project lifecycle.",
    },
  ]

  const techStack = [
    "React",
    "Next.js 15",
    "TypeScript",
    "Firebase",
    "Firestore",
    "Firebase Authentication",
    "SCSS Modules",
    "Responsive Design",
  ]

  return (
    <div className={styles.constructionPmPage}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Construction Project Management App</h1>
        <p className={styles.subtitle}>
          A comprehensive project management solution designed specifically for Main contractors
        </p>
      </section>

      <section className={styles.overview}>
        <h2>Project Overview</h2>
        <div className={styles.overviewContent}>
          <p>
            This Construction Project Management App addresses the unique challenges faced by 
            Main contractors in managing complex construction projects. Built with modern web 
            technologies, it provides an intuitive interface for overseeing multiple projects, 
            coordinating teams, and ensuring timely project delivery.
          </p>
          <p>
            The application streamlines construction workflows by centralizing project information, 
            facilitating communication between stakeholders, and providing real-time visibility 
            into project status. It's designed to reduce administrative overhead and improve 
            project coordination efficiency.
          </p>
        </div>
      </section>

      <section className={styles.features}>
        <h2>Key Features</h2>
        <div className={styles.featuresGrid}>
          {features.map((feature, index) => (
            <div key={index} className={styles.featureCard}>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.techStack}>
        <h2>Technology Stack</h2>
        <div className={styles.techList}>
          {techStack.map((tech) => (
            <span key={tech} className={styles.techTag}>
              {tech}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.industryFocus}>
        <h2>Construction Industry Focus</h2>
        <div className={styles.focusContent}>
          <p>
            Understanding the construction industry's specific needs, this application addresses:
          </p>
          <ul>
            <li>Multi-project coordination and resource allocation</li>
            <li>Compliance tracking and documentation management</li>
            <li>Real-time collaboration between contractors, subcontractors, and clients</li>
            <li>Budget management and cost tracking</li>
            <li>Timeline management with critical path identification</li>
            <li>Mobile-friendly access for on-site use</li>
          </ul>
        </div>
      </section>

      <section className={styles.demo}>
        <h2>Demo & Links</h2>
        <div className={styles.demoContent}>
          <p>
            More details, screenshots, and demo links will be available soon. 
            This project is currently in active development.
          </p>
          <div className={styles.links}>
            <a href="#" className={styles.linkButton} style={{ opacity: 0.5, cursor: "not-allowed" }}>
              Live Demo (Coming Soon)
            </a>
            <a href="#" className={styles.linkButton} style={{ opacity: 0.5, cursor: "not-allowed" }}>
              Source Code (Coming Soon)
            </a>
          </div>
        </div>
      </section>

      <section className={styles.backLink}>
        <Link href="/projects">← Back to Projects</Link>
      </section>
    </div>
  )
}

export default ConstructionPmPage
