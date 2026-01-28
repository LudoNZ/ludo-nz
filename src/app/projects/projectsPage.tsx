"use client"

import React from "react"
import styles from "./projectsPage.module.scss"
import Link from "next/link"

interface Project {
  id: string
  title: string
  description: string
  tech: string[]
  featured: boolean
  link: string
}

const ProjectsPage: React.FC = () => {
  const projects: Project[] = [
    {
      id: "construction-pm",
      title: "Construction Project Management App",
      description:
        "A comprehensive project management solution designed specifically for Main contractors, streamlining construction workflows and improving project coordination.",
      tech: ["React", "Next.js", "TypeScript", "Firebase"],
      featured: true,
      link: "/projects/construction-pm",
    },
    {
      id: "theme-editor",
      title: "Theme Editor",
      description:
        "A dynamic theme editor component with real-time preview and customization capabilities. Soon to be connected to Firestore database.",
      tech: ["React", "Next.js", "TypeScript", "SCSS"],
      featured: false,
      link: "/elements",
    },
  ]

  const featuredProjects = projects.filter((p) => p.featured)
  const otherProjects = projects.filter((p) => !p.featured)

  return (
    <div className={styles.projectsPage}>
      <section className={styles.hero}>
        <h1 className={styles.title}>My Projects</h1>
        <p className={styles.subtitle}>
          A collection of web applications and tools I've built
        </p>
      </section>

      {featuredProjects.length > 0 && (
        <section className={styles.featuredSection}>
          <h2 className={styles.sectionTitle}>Featured Project</h2>
          <div className={styles.featuredGrid}>
            {featuredProjects.map((project) => (
              <div key={project.id} className={styles.featuredCard}>
                <h3 className={styles.projectTitle}>{project.title}</h3>
                <p className={styles.projectDescription}>{project.description}</p>
                <div className={styles.techTags}>
                  {project.tech.map((tech) => (
                    <span key={tech} className={styles.techTag}>
                      {tech}
                    </span>
                  ))}
                </div>
                <Link href={project.link} className={styles.projectLink}>
                  View Project →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {otherProjects.length > 0 && (
        <section className={styles.projectsSection}>
          <h2 className={styles.sectionTitle}>Other Projects</h2>
          <div className={styles.projectsGrid}>
            {otherProjects.map((project) => (
              <div key={project.id} className={styles.projectCard}>
                <h3 className={styles.projectTitle}>{project.title}</h3>
                <p className={styles.projectDescription}>{project.description}</p>
                <div className={styles.techTags}>
                  {project.tech.map((tech) => (
                    <span key={tech} className={styles.techTag}>
                      {tech}
                    </span>
                  ))}
                </div>
                <Link href={project.link} className={styles.projectLink}>
                  View Project →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.cta}>
        <p>
          Interested in working together? <Link href="/contact">Get in touch</Link>
        </p>
      </section>
    </div>
  )
}

export default ProjectsPage
