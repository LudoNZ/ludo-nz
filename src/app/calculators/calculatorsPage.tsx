"use client"

import Link from "next/link"
import { useAuth } from "@/context/auth"
import { Calculator, CALCULATORS, CalculatorStatus, CalculatorStatuses } from "@/lib/calculators"
import styles from "./calculatorsPage.module.scss"

const SECTIONS: { status: CalculatorStatus; title: string; hint?: string; adminOnly?: boolean }[] = [
  { status: "ready", title: "Available now" },
  {
    status: "development",
    title: "In development",
    hint: "Usable now, but still being worked on — expect changes and rough edges.",
  },
  { status: "soon", title: "Coming soon", hint: "Planned, not built yet — listed here so you know what's next." },
  {
    status: "hidden",
    title: "Hidden",
    hint: "Only you can see these — ideas not visible to the public. Set each one's section in the admin dashboard.",
    adminOnly: true,
  },
]

const BADGES: Partial<Record<CalculatorStatus, string>> = {
  development: "In development",
  soon: "Planned",
  hidden: "Hidden",
}

/** Landing page for every estimating tool on the site, in the sections the
 * admin sets from the dashboard: available now, in development, coming soon
 * (a roadmap, not clickable) and — for admins only — hidden ideas. Every
 * card is freely browsable; tools only ask for a login to save. */
const CalculatorsPage = ({ statuses }: { statuses: CalculatorStatuses }) => {
  const isAdmin = !!useAuth()?.isAdmin

  const card = (c: Calculator, status: CalculatorStatus) => {
    // coming-soon and hidden cards are a roadmap for the public; an admin
    // can still open anything that has a page
    const linked = !!c.href && (status === "ready" || status === "development" || isAdmin)
    const inert = status === "soon" || status === "hidden"
    const className = `${styles.card} ${inert ? styles.plannedCard : ""} ${inert && linked ? styles.linkedPlanned : ""}`
    const badge = BADGES[status]
    const body = (
      <>
        {badge && <span className={`${styles.plannedBadge} ${status === "development" ? styles.devBadge : ""}`}>{badge}</span>}
        <h3 className={styles.cardTitle}>{c.title}</h3>
        <p className={styles.cardDescription}>{c.description}</p>
        <div className={styles.tags}>
          {c.tags.map((t) => (
            <span key={t} className={styles.tag}>
              {t}
            </span>
          ))}
        </div>
        {linked && <span className={styles.cardLink}>Open →</span>}
      </>
    )
    return linked ? (
      <Link key={c.id} href={c.href!} className={className}>
        {body}
      </Link>
    ) : (
      <div key={c.id} className={className}>
        {body}
      </div>
    )
  }

  return (
    <div className={styles.calculatorsPage}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Calculators</h1>
        <p className={styles.subtitle}>
          Rule-of-thumb, NZ-construction-accurate estimating tools — real materials lists and cutting
          plans, not just a square-metre guess.
        </p>
      </section>

      {SECTIONS.filter((s) => !s.adminOnly || isAdmin).map((s) => {
        const items = CALCULATORS.filter((c) => statuses[c.id] === s.status)
        if (items.length === 0) return null
        return (
          <section key={s.status} className={styles.section}>
            <h2 className={styles.sectionTitle}>{s.title}</h2>
            {s.hint && <p className={styles.hint}>{s.hint}</p>}
            <div className={styles.grid}>{items.map((c) => card(c, s.status))}</div>
          </section>
        )
      })}
    </div>
  )
}

export default CalculatorsPage
