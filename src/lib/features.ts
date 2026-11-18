/** Every feature (tab) on the site whose access the admin can control.
 *
 * Each feature's access is set from the admin dashboard (Site access) and
 * stored in Firestore (`settings/siteAccess`); `defaultAccess` is only
 * used until that's been saved, or if it can't be read:
 *
 * - `public`: open to everyone, signed in or not.
 * - `granted`: members only — those you've ticked it for in the admin
 *   dashboard (and admins, who always have everything).
 * - `hidden`: admins only; not shown to anyone else, even members who
 *   have it ticked (their ticks are kept for when it's opened up again).
 *
 * The header, the page gates (FeatureGate) and the admin dashboard are all
 * driven from this list. Ids are stored in Firestore and in users' custom
 * claims, so don't rename one once it's in use. */
export type FeatureAccess = "public" | "granted" | "hidden"

export const ACCESS_LEVELS: readonly { value: FeatureAccess; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "granted", label: "Members only" },
  { value: "hidden", label: "Hidden" },
]

export interface Feature {
  id: string
  label: string
  href: string
  defaultAccess: FeatureAccess
  /** shown under the checkbox in the admin dashboard */
  description?: string
}

export const FEATURES = [
  { id: "dice", label: "Dice", href: "/dice", defaultAccess: "public", description: "Shared dice roller sessions" },
  { id: "menu", label: "Menu", href: "/menu", defaultAccess: "public", description: "Meal planner and recipes" },
  {
    id: "calculators",
    label: "Calculators",
    href: "/calculators",
    defaultAccess: "public",
    description: "Hub page for the building tools (the tools themselves stay open)",
  },
  {
    id: "exercise",
    label: "Exercise",
    href: "/exercise",
    defaultAccess: "granted",
    description: "Pull-up tracker",
  },
  {
    id: "interview-prep",
    label: "Interview prep",
    href: "/interview-prep",
    defaultAccess: "granted",
    description: "SQL / interview course",
  },
  {
    id: "finance",
    label: "Finance",
    href: "/finance",
    defaultAccess: "granted",
    description: "Savings and KiwiSaver calculators",
  },
] as const satisfies readonly Feature[]

export type FeatureId = (typeof FEATURES)[number]["id"]

/** Each feature's current access level. */
export type SiteAccess = Record<FeatureId, FeatureAccess>

export const DEFAULT_SITE_ACCESS: SiteAccess = Object.fromEntries(
  FEATURES.map((f) => [f.id, f.defaultAccess]),
) as SiteAccess

const ACCESS_VALUES = new Set<string>(ACCESS_LEVELS.map((l) => l.value))

/** A full, valid access map from whatever was stored: unknown ids and
 * values are dropped and missing features get their default. */
export function normaliseSiteAccess(raw: unknown): SiteAccess {
  const out = { ...DEFAULT_SITE_ACCESS }
  if (raw && typeof raw === "object") {
    for (const f of FEATURES) {
      const v = (raw as Record<string, unknown>)[f.id]
      if (typeof v === "string" && ACCESS_VALUES.has(v)) out[f.id] = v as FeatureAccess
    }
  }
  return out
}

const FEATURE_IDS = new Set<string>(FEATURES.map((f) => f.id))

/** Drops unknown ids, de-duplicates, and sorts, so a list can be stored, or
 * compared with one in a token, without spurious differences. Grants for
 * features that are currently public are kept, so switching one back to
 * members-only restores who had it. */
export function normaliseFeatures(ids: readonly unknown[] | null | undefined): FeatureId[] {
  if (!Array.isArray(ids)) return []
  return [...new Set(ids.filter((id): id is FeatureId => typeof id === "string" && FEATURE_IDS.has(id)))].sort()
}

export function getFeature(id: FeatureId): Feature {
  return FEATURES.find((f) => f.id === id)!
}

/** Whether someone with these grants (or admin) can use a feature, given
 * the site's current access settings. */
export function canUse(id: FeatureId, grants: readonly string[], isAdmin: boolean, siteAccess: SiteAccess): boolean {
  const access = siteAccess[id]
  if (access === "public" || isAdmin) return true
  return access === "granted" && grants.includes(id)
}
