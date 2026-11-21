/** Every calculator on the /calculators hub, and which section it's in.
 *
 * The section is set per calculator from the admin dashboard (Calculators)
 * and stored in Firestore (`settings/calculators`); `defaultStatus` is only
 * used until that's been saved, or if it can't be read:
 *
 * - `ready`: "Available now", at the top.
 * - `development`: "In development" — usable, but still being worked on.
 * - `soon`: "Coming soon" — a roadmap card, not clickable.
 * - `hidden`: not on the page for anyone but admins (ideas not yet public).
 *
 * Ids are stored in Firestore, so don't rename one once it's in use. A
 * calculator without an `href` has no page yet, so its card never links. */
export type CalculatorStatus = "ready" | "development" | "soon" | "hidden"

export const CALCULATOR_STATUSES: readonly { value: CalculatorStatus; label: string }[] = [
  { value: "ready", label: "Ready" },
  { value: "development", label: "In development" },
  { value: "soon", label: "Coming soon" },
  { value: "hidden", label: "Hidden" },
]

export interface Calculator {
  id: string
  title: string
  description: string
  tags: string[]
  /** its page, once it has one */
  href?: string
  defaultStatus: CalculatorStatus
}

export const CALCULATORS: readonly Calculator[] = [
  {
    id: "house",
    title: "House",
    description:
      "A one-storey house from the ground floor plan up: draw the outline and walls or lay out the rooms, see which walls hold the roof up (trusses or rafters) and where a span's too long, walk round it in 3D, and send its outside walls to Weatherboards — kept in step with the plan.",
    tags: ["Floor plan", "Load-bearing walls", "Roof", "3D", "Feeds Weatherboards"],
    href: "/house",
    defaultStatus: "development",
  },
  {
    id: "decking",
    title: "Decking",
    description:
      "Plan a full deck from the piles up: bearers, joists and ledger on the same framing engine as Floor Framing, then the board layout from your actual stock on hand — staggered joins, a real cutting plan, a 3D view and the order.",
    tags: ["Framing", "Board layout", "Cutting plan", "Stock tracking"],
    href: "/decking",
    defaultStatus: "ready",
  },
  {
    id: "retaining-walls",
    title: "Retaining Walls",
    description:
      "A rule-of-thumb DIY materials and labour estimate for a timber post-and-board retaining wall — post sizing, embedment, per-post RL profiles, and an automatic engineer-required warning past 1.5m.",
    tags: ["Posts & boards", "RL profiles", "NZ Building Code aware"],
    href: "/retaining-walls",
    defaultStatus: "ready",
  },
  {
    // (the id predates the rename — it's stored in Firestore, so it stays)
    id: "mid-floor-framing",
    title: "Floor Framing",
    description:
      "A timber floor under ply or particleboard — between two walls, on bearers and piles, or off a ledger on the house. Joist and bearer sizes, piles, blocking and nogs, every sheet laid, a 3D view and a live material order.",
    tags: ["Joists & bearers", "Piles", "Sheet layout", "Material order"],
    href: "/floor-framing",
    defaultStatus: "ready",
  },
  {
    id: "tension",
    title: "Tightline Tension",
    description:
      "How hard a mid-span load actually pulls on two anchors — tarp ridge line, highline, tow strap. Live to-scale diagram, sag angle, and an infinite-tension warning as the line flattens out.",
    tags: ["Sag angle", "Anchor tension", "Live diagram"],
    href: "/tension",
    defaultStatus: "ready",
  },
  {
    id: "weatherboards",
    title: "Weatherboards",
    description:
      "Mark up every elevation — raked tops and bottoms, rakes that start part way along, draggable window and door openings — and get a course-by-course layout with staggered stud joins and the leanest board order across 4.2–6.0 m lengths.",
    tags: ["Elevations", "Rakes & openings", "Board order", "Cutting plan"],
    href: "/weatherboards",
    defaultStatus: "ready",
  },
  {
    id: "stairs",
    title: "Stairs",
    description:
      "Deck stairs from the ground up — the fewest code-compliant steps for your height, framed on straight stringers with wedge blocks, and every decking board placed on the treads.",
    tags: ["Rise & run", "NZBC D1 aware", "Board layout", "Cut list"],
    href: "/stairs",
    defaultStatus: "ready",
  },
  {
    id: "site-projects",
    title: "Site Projects",
    description:
      "Put more than one calculator on one site: import your retaining walls, place them around a site plan, and bring stairs down off them — pin the top tread to a point along a wall and the rise comes from the wall's height there.",
    tags: ["Walls + stairs", "Site plan", "Saved projects"],
    href: "/site-projects",
    defaultStatus: "ready",
  },
  {
    id: "rib-raft",
    title: "Rib Raft Slab",
    description:
      "A waffle slab on any square-cornered footprint: pods set out from the beams, ribs between, edge and internal beams, then the pods (whole and cut), concrete, HD12 with laps, corner bars, mesh sheets, DPM, hardfill and boxing.",
    tags: ["Pod layout", "Concrete", "Steel", "Mesh"],
    href: "/rib-raft",
    defaultStatus: "development",
  },
  {
    id: "intertenancy-walls",
    title: "Intertenancy Walls",
    description:
      "Integra lightweight-concrete party walls between townhouses, slab to roofing: panels stood side by side to the wall's own profile (gables, steps), brackets, FireWool and fire sealant.",
    tags: ["Integra panels", "Brackets", "FireWool", "Townhouses"],
    href: "/intertenancy-walls",
    defaultStatus: "development",
  },
  // Ideas queued up for the same rule-of-thumb, real-materials-list
  // treatment — no page behind these yet. The first block roughly follows a
  // house's build sequence and mostly tracks NZS 3604 section for section;
  // the rest are more standalone DIY jobs.
  {
    id: "footings",
    title: "Footings",
    description:
      "Pad and strip footing size and depth from bearing load and ground conditions, NZS 3604 style — plus a concrete volume and bag-count materials list.",
    tags: ["Footing size", "Depth", "Concrete volume"],
    defaultStatus: "soon",
  },
  {
    id: "wall-framing",
    title: "Wall Framing",
    description:
      "Stud spacing and sizing, dwangs, and a prenail-ready materials list for a wall frame — plus a rough erection time estimate, same as the retaining wall labour estimate.",
    tags: ["Studs", "Dwangs", "Prenail", "Erection time"],
    defaultStatus: "soon",
  },
  {
    id: "lintels",
    title: "Lintels",
    description: "Header beam sizing over door and window openings from span and roof load, off the NZS 3604 lintel tables.",
    tags: ["Lintel size", "Opening span"],
    defaultStatus: "soon",
  },
  {
    id: "roof-framing",
    title: "Roof Framing",
    description: "Rafter and ceiling joist spans and sizing off the NZS 3604 tables, with a full roof framing materials list.",
    tags: ["Rafters", "Ceiling joists", "Spans"],
    defaultStatus: "soon",
  },
  {
    id: "bracing",
    title: "Bracing",
    description: "Wall bracing demand vs. bracing-unit capacity, NZS 3604 style — check a floor plan actually stacks up before you frame it.",
    tags: ["Bracing demand", "BU capacity"],
    defaultStatus: "soon",
  },
  {
    id: "pergola",
    title: "Pergola / Carport",
    description: "Post, beam, and rafter spacing and sizing for a simple open-roof structure, spanned to your dimensions.",
    tags: ["Posts", "Beams", "Rafters"],
    defaultStatus: "soon",
  },
  {
    id: "paling-fence",
    title: "Paling Fence",
    description:
      "Post spacing, rail count, and paling coverage for a standard timber paling fence — built on the same post/rail/infill engine as the retaining wall calculator.",
    tags: ["Posts", "Rails", "Palings"],
    defaultStatus: "soon",
  },
  {
    id: "roof-cladding",
    title: "Roof Cladding",
    description: "Sheet count, purlin spacing, and flashing lengths for a simple gable or skillion roof.",
    tags: ["Sheet count", "Purlins", "Flashing"],
    defaultStatus: "soon",
  },
  {
    id: "guttering",
    title: "Guttering & Downpipes",
    description: "Gutter length and downpipe count and fall, sized off your roof area and catchment.",
    tags: ["Roof area", "Fall", "Downpipes"],
    defaultStatus: "soon",
  },
]

/** Each calculator's section, by id. */
export type CalculatorStatuses = Record<string, CalculatorStatus>

export const DEFAULT_CALCULATOR_STATUSES: CalculatorStatuses = Object.fromEntries(
  CALCULATORS.map((c) => [c.id, c.defaultStatus]),
)

const STATUS_VALUES = new Set<string>(CALCULATOR_STATUSES.map((s) => s.value))

/** A full, valid status map from whatever was stored: unknown ids and
 * values are dropped and missing calculators get their default. */
export function normaliseCalculatorStatuses(raw: unknown): CalculatorStatuses {
  const out = { ...DEFAULT_CALCULATOR_STATUSES }
  if (raw && typeof raw === "object") {
    for (const c of CALCULATORS) {
      const v = (raw as Record<string, unknown>)[c.id]
      if (typeof v === "string" && STATUS_VALUES.has(v)) out[c.id] = v as CalculatorStatus
    }
  }
  return out
}
