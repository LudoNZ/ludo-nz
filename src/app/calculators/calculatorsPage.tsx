"use client"

import Link from "next/link"
import { useAuth } from "@/context/auth"
import styles from "./calculatorsPage.module.scss"

interface LiveCalculator {
  id: string
  title: string
  description: string
  tags: string[]
  link: string
  requiresLogin?: boolean
}

interface PlannedCalculator {
  id: string
  title: string
  description: string
  tags: string[]
}

const LIVE_CALCULATORS: LiveCalculator[] = [
  {
    id: "decking",
    title: "Decking",
    description:
      "Plan a full deck's board layout from your actual stock on hand — joist grid, staggered joins, a real cutting plan, and a shopping list, not just a square-metre estimate.",
    tags: ["Board layout", "Cutting plan", "Stock tracking"],
    link: "/decking",
    requiresLogin: true,
  },
  {
    id: "retaining-walls",
    title: "Retaining Walls",
    description:
      "A rule-of-thumb DIY materials and labour estimate for a timber post-and-board retaining wall — post sizing, embedment, per-post RL profiles, and an automatic engineer-required warning past 1.5m.",
    tags: ["Posts & boards", "RL profiles", "NZ Building Code aware"],
    link: "/retaining-walls",
  },
]

// Ideas queued up for the same rule-of-thumb, real-materials-list treatment —
// purely a roadmap placeholder, no functionality behind these yet.
const PLANNED_CALCULATORS: PlannedCalculator[] = [
  {
    id: "paling-fence",
    title: "Paling Fence",
    description:
      "Post spacing, rail count, and paling coverage for a standard timber paling fence — built on the same post/rail/infill engine as the retaining wall calculator.",
    tags: ["Posts", "Rails", "Palings"],
  },
  {
    id: "concrete-footings",
    title: "Concrete Footings & Slabs",
    description: "Volume and bag-count estimate for footings, piles, or a slab pour from your dimensions and mix ratio.",
    tags: ["Volume", "Bag count"],
  },
  {
    id: "stair-stringer",
    title: "Stair Stringer",
    description: "Rise/going/tread count for a code-compliant stringer between two levels, with a cut-list for the stringer itself.",
    tags: ["Rise & going", "Cut list"],
  },
  {
    id: "pergola",
    title: "Pergola / Carport",
    description: "Post, beam, and rafter spacing and sizing for a simple open-roof structure, spanned to your dimensions.",
    tags: ["Posts", "Beams", "Rafters"],
  },
  {
    id: "roofing",
    title: "Roofing",
    description: "Sheet count, purlin spacing, and flashing lengths for a simple gable or skillion roof.",
    tags: ["Sheet count", "Purlins", "Flashing"],
  },
  {
    id: "guttering",
    title: "Guttering & Downpipes",
    description: "Gutter length and downpipe count and fall, sized off your roof area and catchment.",
    tags: ["Roof area", "Fall", "Downpipes"],
  },
]

/** Landing page for every estimating tool on the site — what's actually
 * built (Decking, Retaining Walls) plus a roadmap of what's planned next,
 * so the "coming soon" list itself sets expectations rather than those
 * tools just quietly not existing yet. Public: Decking is auth-gated on
 * its own page (redirects to /login), but the showcase itself should be
 * browsable by anyone, same as the rest of the site. */
const CalculatorsPage = () => {
  const auth = useAuth()
  const loggedIn = !!auth?.currentUser

  return (
    <div className={styles.calculatorsPage}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Calculators</h1>
        <p className={styles.subtitle}>
          Rule-of-thumb, NZ-construction-accurate estimating tools — real materials lists and cutting
          plans, not just a square-metre guess.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Available now</h2>
        <div className={styles.grid}>
          {LIVE_CALCULATORS.map((c) => (
            <Link key={c.id} href={c.link} className={styles.card}>
              <h3 className={styles.cardTitle}>{c.title}</h3>
              <p className={styles.cardDescription}>{c.description}</p>
              <div className={styles.tags}>
                {c.tags.map((t) => (
                  <span key={t} className={styles.tag}>
                    {t}
                  </span>
                ))}
              </div>
              <span className={styles.cardLink}>{c.requiresLogin && !loggedIn ? "Login to use →" : "Open →"}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Coming soon</h2>
        <p className={styles.hint}>Planned, not built yet — listed here so you know what&apos;s next.</p>
        <div className={styles.grid}>
          {PLANNED_CALCULATORS.map((c) => (
            <div key={c.id} className={`${styles.card} ${styles.plannedCard}`}>
              <span className={styles.plannedBadge}>Planned</span>
              <h3 className={styles.cardTitle}>{c.title}</h3>
              <p className={styles.cardDescription}>{c.description}</p>
              <div className={styles.tags}>
                {c.tags.map((t) => (
                  <span key={t} className={styles.tag}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default CalculatorsPage
