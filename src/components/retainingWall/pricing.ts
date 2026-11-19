/** Pricing for a retaining wall: a library of material and labour prices
 * (each with the date it was last confirmed), the estimate built from a
 * wall's quantities and those prices, and the settings an estimate keeps
 * with its wall (markup, extra lines, the proposal's details).
 *
 * Pure: no React, no Firestore — see priceLibraryActions.ts for where the
 * library lives (shared prices for everyone, company details per person) and estimateCard.tsx / proposalView.tsx for the screens.
 * Prices are NZD, excluding GST. */

import type { ProfileTotals, WallProfile } from "./postProfile"

// ── price library ────────────────────────────────────────────────────

export type PriceCategory = "posts" | "boards" | "topCap" | "concrete" | "gravel" | "labour" | "fixings" | "drainage" | "other"

export const PRICE_CATEGORIES: { id: PriceCategory; label: string; hint: string }[] = [
  { id: "posts", label: "Posts", hint: "Per lineal metre, or by length (round poles: a post is priced at the shortest length it fits in). Set the post size to match the wall's posts" },
  { id: "boards", label: "Facing boards", hint: "Facing courses and the top board, per lineal metre" },
  { id: "topCap", label: "Top cap", hint: "Per lineal metre" },
  { id: "concrete", label: "Concrete", hint: "Per m³ (ready-mix) or per bag" },
  { id: "gravel", label: "Gravel", hint: "Per m³, for gravel pads when used" },
  { id: "labour", label: "Labour", hint: "Per hour" },
  { id: "fixings", label: "Fixings", hint: "An allowance per metre of wall" },
  { id: "drainage", label: "Drainage", hint: "Per metre of wall, when drainage is included" },
  { id: "other", label: "Other", hint: "Anything else, added to an estimate by hand" },
]

export type PriceUnit = "m" | "m³" | "bag" | "each" | "hour"

export const PRICE_UNITS: { id: PriceUnit; label: string }[] = [
  { id: "m", label: "per m" },
  { id: "m³", label: "per m³" },
  { id: "bag", label: "per bag" },
  { id: "each", label: "each" },
  { id: "hour", label: "per hour" },
]

export interface LengthPrice {
  lengthM: number
  /** NZD excl GST, one post this long */
  price: number
}

export interface PriceItem {
  id: string
  category: PriceCategory
  name: string
  unit: PriceUnit
  /** NZD excl GST, per unit */
  price: number
  /** posts: the size it's for, e.g. "150 x 150mm" (blank = any size) */
  sizeLabel?: string
  /** posts sold by the length (round poles): the price of one post at
   * each stock length. When set, a post is priced at the shortest length
   * it fits in rather than per metre, and `price` is ignored. */
  lengthPrices?: LengthPrice[]
  /** concrete sold by the bag: m³ one bag makes (a 20 kg bag ≈ 0.01) */
  bagYieldM3?: number
  supplier?: string
  /** ISO date-time the price was last set or confirmed; null = never */
  confirmedAt: string | null
}

/** Your business, for the proposal's letterhead. Blank fields print as
 * placeholders, so a proposal can go out before they're all filled in. */
export interface CompanyDetails {
  name: string
  tagline: string
  address: string
  phone: string
  email: string
  website: string
  gstNumber: string
  /** e.g. "50% deposit on acceptance, balance on completion" */
  paymentTerms: string
}

export const BLANK_COMPANY: CompanyDetails = {
  name: "",
  tagline: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  gstNumber: "",
  paymentTerms: "",
}

export interface PriceLibrary {
  items: PriceItem[]
  company: CompanyDetails
}

/** A price this old (or never confirmed) is flagged wherever it's used. */
export const STALE_AFTER_DAYS = 91 // ~3 months

export function priceAgeDays(item: Pick<PriceItem, "confirmedAt">, now = Date.now()): number | null {
  if (!item.confirmedAt) return null
  const t = Date.parse(item.confirmedAt)
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 86_400_000)) : null
}

export function isStale(item: Pick<PriceItem, "confirmedAt">, now = Date.now()): boolean {
  const age = priceAgeDays(item, now)
  return age === null || age > STALE_AFTER_DAYS
}

/** "today", "12 days ago", "4 months ago", "never" */
export function describeAge(item: Pick<PriceItem, "confirmedAt">, now = Date.now()): string {
  const age = priceAgeDays(item, now)
  if (age === null) return "never confirmed"
  if (age === 0) return "confirmed today"
  if (age < 45) return `confirmed ${age} day${age === 1 ? "" : "s"} ago`
  const months = Math.round(age / 30.4)
  return `confirmed ${months} month${months === 1 ? "" : "s"} ago`
}

let idCounter = 0
export const newPriceId = () => `p${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** A starting library: the usual items with placeholder prices, none of
 * them confirmed — so every one is flagged until it's checked against a
 * supplier. */
export const STARTER_PRICE_ITEMS: PriceItem[] = [
  { id: "starter-post-125", category: "posts", name: "H5 posts 125 x 125mm", sizeLabel: "125 x 125mm", unit: "m", price: 18, confirmedAt: null },
  { id: "starter-post-150", category: "posts", name: "H5 posts 150 x 150mm", sizeLabel: "150 x 150mm", unit: "m", price: 26, confirmedAt: null },
  { id: "starter-post-200", category: "posts", name: "H5 posts 200 x 200mm", sizeLabel: "200 x 200mm", unit: "m", price: 48, confirmedAt: null },
  { id: "starter-boards", category: "boards", name: "H4 facing boards 200 x 50mm", unit: "m", price: 9.5, confirmedAt: null },
  { id: "starter-cap", category: "topCap", name: "H3.2 top cap 150 x 50mm", unit: "m", price: 7, confirmedAt: null },
  { id: "starter-concrete", category: "concrete", name: "Ready-mix concrete 20 MPa", unit: "m³", price: 330, confirmedAt: null },
  { id: "starter-gravel", category: "gravel", name: "GAP 20 gravel", unit: "m³", price: 70, confirmedAt: null },
  { id: "starter-labour", category: "labour", name: "Labour", unit: "hour", price: 75, confirmedAt: null },
  { id: "starter-fixings", category: "fixings", name: "Fixings allowance (nails, bolts)", unit: "m", price: 6, confirmedAt: null },
  { id: "starter-drainage", category: "drainage", name: "Drainage coil and drainage metal", unit: "m", price: 28, confirmedAt: null },
]

/** Round pole prices by length, excl GST, as sent in by a supplier on
 * 19 Nov 2026 (non high-density poles, priced per post by SED band).
 * Each band is matched to the wall's "NNNmm round" post size at the
 * bottom of the band. */
// TODO: the supplier's name is still to come
export const POLE_SUPPLIER = "Supplier TBC (name to come)"
export const POLE_PRICES_CONFIRMED = "2026-11-19T00:00:00.000Z"
const POLE_BANDS: [number, [number, number][]][] = [
  [150, [[1.8, 28.14], [2.4, 38.31], [2.7, 43.53], [3.0, 49.27], [3.6, 61.01], [4.2, 75.88], [4.8, 91.03], [5.4, 98.68], [6.0, 109.15], [7.0, 126.23]]],
  [175, [[1.8, 34.68], [2.1, 44.81], [2.4, 46.86], [2.7, 53.28], [3.0, 60.92], [3.6, 74.57], [4.2, 92.91], [4.8, 109.12], [5.4, 125.31], [6.0, 142.85]]],
  [200, [[1.8, 43.28], [2.1, 55.4], [2.4, 60.39], [2.7, 68.02], [3.0, 76.3], [3.6, 90.43], [4.2, 113.95], [4.8, 136.82], [5.4, 157.04], [6.0, 167.46]]],
  [225, [[1.8, 52.24], [2.4, 70.79], [2.7, 81.83], [3.0, 90.51], [3.6, 113.0], [4.2, 139.42], [4.8, 143.17], [5.4, 185.2], [6.0, 211.28], [7.0, 239.89], [8.0, 309.57]]],
  [250, [[1.8, 64.35], [2.4, 87.83], [2.7, 99.13], [3.0, 111.3], [3.6, 139.13], [4.2, 166.96], [4.8, 195.65], [5.4, 226.09], [6.0, 252.17], [7.0, 291.3], [8.0, 366.96], [9.0, 426.09]]],
]
export const POLE_PRICE_LIST: PriceItem[] = POLE_BANDS.map(([sed, rows]) => ({
  id: `pole-sed-${sed}`,
  category: "posts",
  name: `Round posts ${sed}–${sed + 24} SED`,
  sizeLabel: `${sed}mm round`,
  unit: "each",
  price: 0,
  lengthPrices: rows.map(([lengthM, price]) => ({ lengthM, price })),
  supplier: POLE_SUPPLIER,
  confirmedAt: POLE_PRICES_CONFIRMED,
}))

/** Adds the pole price list to a library, replacing any earlier copy of
 * it (same ids) and leaving everything else alone. */
export function withPolePriceList(items: PriceItem[]): PriceItem[] {
  const ids = new Set(POLE_PRICE_LIST.map((i) => i.id))
  const kept = items.filter((i) => !ids.has(i.id))
  const firstPost = kept.findIndex((i) => i.category === "posts")
  const at = firstPost < 0 ? kept.length : firstPost
  return [...kept.slice(0, at), ...POLE_PRICE_LIST, ...kept.slice(at)]
}

/** The price of one post `neededM` long off a by-length item: the
 * shortest stock length that's long enough, or null if none is. */
export function stockLengthFor(item: PriceItem, neededM: number): LengthPrice | null {
  const rows = [...(item.lengthPrices ?? [])].sort((a, b) => a.lengthM - b.lengthM)
  return rows.find((r) => r.lengthM >= neededM - 1e-6) ?? null
}

const CATEGORY_IDS = new Set<string>(PRICE_CATEGORIES.map((c) => c.id))
const UNIT_IDS = new Set<string>(PRICE_UNITS.map((u) => u.id))
const str = (v: unknown) => (typeof v === "string" ? v : "")

/** Reads a stored library defensively (unknown fields dropped, bad values
 * defaulted). An empty or missing library starts from the starter items. */
export function libraryFromData(data: unknown): PriceLibrary {
  const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>
  const rawItems = Array.isArray(d.items) ? d.items : null
  const items: PriceItem[] = (rawItems ?? withPolePriceList(STARTER_PRICE_ITEMS)).flatMap((raw): PriceItem[] => {
    const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
    if (typeof r.id !== "string" || !CATEGORY_IDS.has(str(r.category))) return []
    const price = Number(r.price)
    return [
      {
        id: r.id,
        category: r.category as PriceCategory,
        name: str(r.name) || "Unnamed item",
        unit: UNIT_IDS.has(str(r.unit)) ? (r.unit as PriceUnit) : "each",
        price: Number.isFinite(price) && price >= 0 ? price : 0,
        ...(str(r.sizeLabel) ? { sizeLabel: str(r.sizeLabel) } : {}),
        ...(Array.isArray(r.lengthPrices)
          ? {
              lengthPrices: (r.lengthPrices as unknown[]).flatMap((lp): LengthPrice[] => {
                const o = (typeof lp === "object" && lp !== null ? lp : {}) as Record<string, unknown>
                const lengthM = Number(o.lengthM)
                const price = Number(o.price)
                return lengthM > 0 && lengthM <= 20 && Number.isFinite(price) && price >= 0 ? [{ lengthM, price }] : []
              }),
            }
          : {}),
        ...(Number(r.bagYieldM3) > 0 ? { bagYieldM3: Number(r.bagYieldM3) } : {}),
        ...(str(r.supplier) ? { supplier: str(r.supplier) } : {}),
        confirmedAt: typeof r.confirmedAt === "string" && Number.isFinite(Date.parse(r.confirmedAt)) ? r.confirmedAt : null,
      },
    ]
  })
  const c = (typeof d.company === "object" && d.company !== null ? d.company : {}) as Record<string, unknown>
  const company = Object.fromEntries(Object.keys(BLANK_COMPANY).map((k) => [k, str(c[k])])) as unknown as CompanyDetails
  return { items, company }
}

// ── estimate settings, kept with each wall ──────────────────────────

export interface ExtraLine {
  id: string
  description: string
  quantity: number
  unit: string
  /** NZD excl GST, cost (before markup) */
  unitPrice: number
}

export interface ProposalDetails {
  clientName: string
  siteAddress: string
  /** e.g. "Q-1024"; blank prints a placeholder */
  reference: string
  /** ISO date the proposal is dated; blank = today */
  date: string
  validDays: number
  /** opening paragraph under "Scope of works" (blank = written from the wall) */
  intro: string
  exclusions: string
  /** show each line's quantity and rate, or just the amounts */
  showRates: boolean
}

export interface EstimateSettings {
  /** % added to cost to give the price */
  markupPct: number
  /** % allowance for the unknown, on the priced total, shown as its own line */
  contingencyPct: number
  gstPct: number
  /** include a drainage line (per metre of wall) */
  includeDrainage: boolean
  /** include a fixings allowance line (per metre of wall) */
  includeFixings: boolean
  /** a library item picked by hand for a line, keyed by the line's key */
  itemChoice: Record<string, string>
  extraLines: ExtraLine[]
  proposal: ProposalDetails
}

export const DEFAULT_EXCLUSIONS = [
  "Engineering design, building consent and council fees, unless listed above. Walls over 1.5 m high, or with a driveway, building or slope above them, need an engineer.",
  "Removal of spoil from site.",
  "Rock, buried services or other obstructions found while drilling.",
  "Reinstating lawns, gardens or paving disturbed by the work.",
  "Moving services (water, power, stormwater) in the line of the wall.",
].join("\n")

export const DEFAULT_ESTIMATE_SETTINGS: EstimateSettings = {
  markupPct: 15,
  contingencyPct: 5,
  gstPct: 15,
  includeDrainage: false,
  includeFixings: true,
  itemChoice: {},
  extraLines: [],
  proposal: {
    clientName: "",
    siteAddress: "",
    reference: "",
    date: "",
    validDays: 30,
    intro: "",
    exclusions: DEFAULT_EXCLUSIONS,
    showRates: true,
  },
}

const num = (v: unknown, fallback: number, min = 0, max = Infinity) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

export function estimateSettingsFromData(data: unknown): EstimateSettings {
  const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>
  const p = (typeof d.proposal === "object" && d.proposal !== null ? d.proposal : {}) as Record<string, unknown>
  const def = DEFAULT_ESTIMATE_SETTINGS
  return {
    markupPct: num(d.markupPct, def.markupPct, 0, 1000),
    contingencyPct: num(d.contingencyPct, def.contingencyPct, 0, 100),
    gstPct: num(d.gstPct, def.gstPct, 0, 100),
    includeDrainage: typeof d.includeDrainage === "boolean" ? d.includeDrainage : def.includeDrainage,
    includeFixings: typeof d.includeFixings === "boolean" ? d.includeFixings : def.includeFixings,
    itemChoice: Object.fromEntries(
      Object.entries(typeof d.itemChoice === "object" && d.itemChoice !== null ? d.itemChoice : {}).filter(([, v]) => typeof v === "string"),
    ) as Record<string, string>,
    extraLines: (Array.isArray(d.extraLines) ? d.extraLines : []).flatMap((raw): ExtraLine[] => {
      const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
      if (typeof r.id !== "string") return []
      return [{ id: r.id, description: str(r.description), quantity: num(r.quantity, 1), unit: str(r.unit), unitPrice: num(r.unitPrice, 0) }]
    }),
    proposal: {
      clientName: str(p.clientName),
      siteAddress: str(p.siteAddress),
      reference: str(p.reference),
      date: str(p.date),
      validDays: Math.round(num(p.validDays, def.proposal.validDays, 1, 365)),
      intro: str(p.intro),
      exclusions: typeof p.exclusions === "string" ? p.exclusions : def.proposal.exclusions,
      showRates: typeof p.showRates === "boolean" ? p.showRates : def.proposal.showRates,
    },
  }
}

// ── the estimate ─────────────────────────────────────────────────────

/** posts are bought in lengths rounded up to this */
export const POST_LENGTH_STEP_M = 0.3

export interface EstimateLine {
  /** stable id for the line ("posts:150 x 150mm", "concrete", "extra:…") */
  key: string
  category: PriceCategory
  description: string
  /** extra detail under the description, e.g. "12 posts, 2.4–3.0 m" */
  detail?: string
  quantity: number
  unit: string
  /** the key a hand-picked item is kept under (itemChoice); the same for
   * every length of one post size */
  choiceKey: string
  /** the library item priced from, if any */
  item: PriceItem | null
  /** the items that could price this line, for picking another */
  candidates: PriceItem[]
  /** NZD excl GST, cost per unit; null when there's no price for it */
  unitCost: number | null
  cost: number
  /** the price used is over STALE_AFTER_DAYS old, or never confirmed */
  stale: boolean
  /** typed in by hand on this estimate rather than from the library */
  manual: boolean
}

export interface Estimate {
  lines: EstimateLine[]
  /** NZD excl GST: lines at cost */
  costSubtotal: number
  markup: number
  /** cost + markup */
  priceSubtotal: number
  contingency: number
  totalExGst: number
  gst: number
  totalIncGst: number
  /** lines with no price at all */
  missingCount: number
  staleCount: number
  /** multiply a line's cost by this to get its price on the proposal */
  sellFactor: number
}

const normSize = (v: string) => v.replace(/\s/g, "").toLowerCase()
const roundUp = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step
const fmtM = (m: number) => `${m.toFixed(1)} m`

/** Each post's length, height above ground plus how far it goes down, by
 * size (not rounded). */
export function postNeededLengthsM(profile: WallProfile, postIndices: number[]): Map<string, number[]> {
  const bySize = new Map<string, number[]>()
  for (const i of postIndices) {
    const p = profile.posts[i]
    const lengthM = Math.max(0, p.topLevelM - p.groundLevelM) + p.postDepthM
    bySize.set(p.sizeLabel, [...(bySize.get(p.sizeLabel) ?? []), lengthM])
  }
  return bySize
}

/** Each post as bought: its height above ground plus how far it goes down,
 * rounded up to the next POST_LENGTH_STEP_M. */
export function postPurchaseLengthsM(profile: WallProfile, postIndices: number[]): Map<string, number[]> {
  const bySize = new Map<string, number[]>()
  for (const i of postIndices) {
    const p = profile.posts[i]
    const lengthM = roundUp(Math.max(0, p.topLevelM - p.groundLevelM) + p.postDepthM, POST_LENGTH_STEP_M)
    bySize.set(p.sizeLabel, [...(bySize.get(p.sizeLabel) ?? []), lengthM])
  }
  return bySize
}

/** Everything priced, line by line, from the wall's quantities. */
export function buildEstimate(
  profile: WallProfile,
  totals: ProfileTotals,
  wallLengthM: number,
  hasGravel: boolean,
  library: PriceItem[],
  settings: EstimateSettings,
  now = Date.now(),
): Estimate {
  const lines: EstimateLine[] = []
  /** the item for a line: one picked by hand, else the best match. With
   * `matches`, only an item it accepts is picked automatically (a post
   * line never quietly takes another size's price); the rest can still
   * be picked by hand. */
  const pick = (key: string, category: PriceCategory, matches?: ((i: PriceItem) => boolean)[]) => {
    const candidates = library.filter((i) => i.category === category)
    const chosen = settings.itemChoice[key] ? candidates.find((i) => i.id === settings.itemChoice[key]) : undefined
    // tried in order, first that finds an item wins
    const auto = matches ? matches.reduce<PriceItem | undefined>((found, m) => found ?? candidates.find(m), undefined) : candidates[0]
    return { candidates, item: chosen ?? auto ?? null }
  }
  const add = (key: string, category: PriceCategory, description: string, quantity: number, defaultUnit: string, detail?: string, matches?: ((i: PriceItem) => boolean)[]) => {
    if (!(quantity > 0)) return
    const { candidates, item } = pick(key, category, matches)
    let qty = quantity
    let unit = defaultUnit
    // concrete bought by the bag: whole bags of the item's yield
    if (item && category === "concrete" && item.unit === "bag") {
      qty = Math.ceil(quantity / (item.bagYieldM3 ?? 0.01) - 1e-9)
      unit = "bags"
    }
    const unitCost = item ? item.price : null
    lines.push({
      key,
      choiceKey: key,
      category,
      description,
      detail,
      quantity: qty,
      unit,
      item,
      candidates,
      unitCost,
      cost: unitCost !== null ? unitCost * qty : 0,
      stale: item ? isStale(item, now) : false,
      manual: false,
    })
  }

  // posts, by size: by the length when the price is by length (round
  // poles), else per lineal metre as bought
  const needed = postNeededLengthsM(profile, totals.postIndices)
  for (const [size, lengths] of postPurchaseLengthsM(profile, totals.postIndices)) {
    const key = `posts:${size}`
    const sizeMatches = [(i: PriceItem) => normSize(i.sizeLabel ?? "") === normSize(size), (i: PriceItem) => !i.sizeLabel]
    const { candidates, item } = pick(key, "posts", sizeMatches)
    if (item?.lengthPrices?.length) {
      const stale = isStale(item, now)
      const byStock = new Map<number, { price: number; count: number }>()
      const tooLong: number[] = []
      for (const l of needed.get(size) ?? []) {
        const s = stockLengthFor(item, l)
        if (!s) tooLong.push(l)
        else byStock.set(s.lengthM, { price: s.price, count: (byStock.get(s.lengthM)?.count ?? 0) + 1 })
      }
      const sorted = [...byStock.entries()].sort((a, b) => a[0] - b[0])
      sorted.forEach(([lengthM, { price, count }], n) => {
        lines.push({
          key: `${key}@${lengthM}`,
          choiceKey: key,
          category: "posts",
          description: `Posts ${size}, ${fmtM(lengthM)}`,
          detail: `${count} post${count === 1 ? "" : "s"}`,
          quantity: count,
          unit: "each",
          item,
          // the picker shows on the first length only; it sets them all
          candidates: n === 0 ? candidates : [],
          unitCost: price,
          cost: price * count,
          stale,
          manual: false,
        })
      })
      if (tooLong.length) {
        const longest = Math.max(...(item.lengthPrices ?? []).map((r) => r.lengthM))
        lines.push({
          key: `${key}@long`,
          choiceKey: key,
          category: "posts",
          description: `Posts ${size}, over ${fmtM(longest)}`,
          detail: `${tooLong.length} post${tooLong.length === 1 ? "" : "s"} up to ${fmtM(Math.max(...tooLong))} long, longer than the longest length priced`,
          quantity: tooLong.length,
          unit: "each",
          item: null,
          candidates: sorted.length ? [] : candidates,
          unitCost: null,
          cost: 0,
          stale: false,
          manual: false,
        })
      }
      continue
    }

    const total = lengths.reduce((s, l) => s + l, 0)
    const lo = Math.min(...lengths)
    const hi = Math.max(...lengths)
    add(
      key,
      "posts",
      `Posts ${size}`,
      Number(total.toFixed(2)),
      "m",
      `${lengths.length} post${lengths.length === 1 ? "" : "s"}, ${lo === hi ? fmtM(lo) : `${fmtM(lo)}–${fmtM(hi)}`} long`,
      // this size's price, or failing that one set for any size
      sizeMatches,
    )
  }

  // facing courses + top board: the stock lengths ordered
  const boardLm = totals.boardOrder.reduce((s, o) => s + o.lengthM * o.count, 0)
  const boardCount = totals.boardOrder.reduce((s, o) => s + o.count, 0)
  add(
    "boards",
    "boards",
    "Facing boards and top board",
    Number(boardLm.toFixed(2)),
    "m",
    totals.boardOrder.map((o) => `${o.count} × ${o.lengthM} m`).join(", ") + (boardCount ? ` (${boardCount} boards)` : ""),
  )
  if (totals.topCapOrder.length) {
    const capLm = totals.topCapOrder.reduce((s, o) => s + o.lengthM * o.count, 0)
    add("topCap", "topCap", "Top cap", Number(capLm.toFixed(2)), "m", totals.topCapOrder.map((o) => `${o.count} × ${o.lengthM} m`).join(", "))
  }

  // concrete with the usual 10% for over-dug holes and spillage
  const concreteM3 = totals.totalConcreteVolumeM3 * 1.1
  add("concrete", "concrete", "Concrete", Number(concreteM3.toFixed(3)), "m³", `${totals.totalConcreteVolumeM3.toFixed(3)} m³ + 10% waste`)
  if (hasGravel) add("gravel", "gravel", "Gravel base pads", Number(totals.totalGravelBaseVolumeM3.toFixed(3)), "m³")
  if (settings.includeDrainage) add("drainage", "drainage", "Drainage behind the wall", Number(wallLengthM.toFixed(2)), "m")
  if (settings.includeFixings) add("fixings", "fixings", "Fixings", Number(wallLengthM.toFixed(2)), "m", "allowance per metre of wall")
  add("labour", "labour", "Labour", Number(totals.labor.totalHours.toFixed(1)), "hours", "set out, drill and set posts, board up")

  for (const x of settings.extraLines) {
    lines.push({
      key: `extra:${x.id}`,
      choiceKey: `extra:${x.id}`,
      category: "other",
      description: x.description || "Extra item",
      quantity: x.quantity,
      unit: x.unit,
      item: null,
      candidates: [],
      unitCost: x.unitPrice,
      cost: x.unitPrice * x.quantity,
      stale: false,
      manual: true,
    })
  }

  const costSubtotal = lines.reduce((s, l) => s + l.cost, 0)
  const sellFactor = 1 + settings.markupPct / 100
  const markup = costSubtotal * (sellFactor - 1)
  const priceSubtotal = costSubtotal + markup
  const contingency = priceSubtotal * (settings.contingencyPct / 100)
  const totalExGst = priceSubtotal + contingency
  const gst = totalExGst * (settings.gstPct / 100)
  return {
    lines,
    costSubtotal,
    markup,
    priceSubtotal,
    contingency,
    totalExGst,
    gst,
    totalIncGst: totalExGst + gst,
    missingCount: lines.filter((l) => l.unitCost === null).length,
    staleCount: lines.filter((l) => l.stale).length,
    sellFactor,
  }
}

export const formatNzd = (v: number) =>
  v.toLocaleString("en-NZ", { style: "currency", currency: "NZD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
