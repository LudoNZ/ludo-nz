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
  {
    id: "mid-floor-framing",
    title: "Mid-Floor Framing",
    description:
      "Joist size and spacing off a rule-of-thumb NZS 3604-style span table, hangers or skew-nail fixings, blocking, and a flooring sheet count — all with a labour estimate and a to-scale plan.",
    tags: ["Joist spans", "Hangers", "Blocking", "Flooring"],
    link: "/mid-floor-framing",
  },
]

// Ideas queued up for the same rule-of-thumb, real-materials-list treatment
// — purely a roadmap placeholder, no functionality behind these yet. The
// first block roughly follows a house's actual build sequence, and mostly
// tracks NZS 3604 (the NZ timber-framed buildings standard) section for
// section, same reference-table-driven spirit as the retaining wall
// calculator; the rest are more standalone DIY jobs.
const PLANNED_CALCULATORS: PlannedCalculator[] = [
  {
    id: "footings",
    title: "Footings",
    description:
      "Pad and strip footing size and depth from bearing load and ground conditions, NZS 3604 style — plus a concrete volume and bag-count materials list.",
    tags: ["Footing size", "Depth", "Concrete volume"],
  },
  {
    id: "piles",
    title: "Piles",
    description: "Timber pile size and spacing under a floor, from bearer spans and pile height — with a full pile and bearer materials list.",
    tags: ["Pile spacing", "Pile size", "Bearers"],
  },
  {
    id: "wall-framing",
    title: "Wall Framing",
    description:
      "Stud spacing and sizing, dwangs, and a prenail-ready materials list for a wall frame — plus a rough erection time estimate, same as the retaining wall labour estimate.",
    tags: ["Studs", "Dwangs", "Prenail", "Erection time"],
  },
  {
    id: "lintels",
    title: "Lintels",
    description: "Header beam sizing over door and window openings from span and roof load, off the NZS 3604 lintel tables.",
    tags: ["Lintel size", "Opening span"],
  },
  {
    id: "roof-framing",
    title: "Roof Framing",
    description: "Rafter and ceiling joist spans and sizing off the NZS 3604 tables, with a full roof framing materials list.",
    tags: ["Rafters", "Ceiling joists", "Spans"],
  },
  {
    id: "bracing",
    title: "Bracing",
    description: "Wall bracing demand vs. bracing-unit capacity, NZS 3604 style — check a floor plan actually stacks up before you frame it.",
    tags: ["Bracing demand", "BU capacity"],
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
    id: "paling-fence",
    title: "Paling Fence",
    description:
      "Post spacing, rail count, and paling coverage for a standard timber paling fence — built on the same post/rail/infill engine as the retaining wall calculator.",
    tags: ["Posts", "Rails", "Palings"],
  },
  {
    id: "roof-cladding",
    title: "Roof Cladding",
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
