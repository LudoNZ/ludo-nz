/** Every feature (tab) on the site that access can be granted to.
 *
 * - `public`: open to everyone, signed in or not. Listed here so a feature
 *   can be moved behind an invite later by flipping one field.
 * - `granted`: only members you've ticked it for in the admin dashboard
 *   (and admins, who always have everything).
 *
 * The header, the page gates (FeatureGate) and the admin dashboard's
 * checkboxes are all driven from this list. Ids are stored in Firestore and
 * in users' custom claims, so don't rename one once it's in use. */
export type FeatureAccess = "public" | "granted"

export interface Feature {
  id: string
  label: string
  href: string
  access: FeatureAccess
  /** shown under the checkbox in the admin dashboard */
  description?: string
}

export const FEATURES = [
  { id: "dice", label: "Dice", href: "/dice", access: "public" },
  { id: "menu", label: "Menu", href: "/menu", access: "public" },
  { id: "calculators", label: "Calculators", href: "/calculators", access: "public" },
  {
    id: "exercise",
    label: "Exercise",
    href: "/exercise",
    access: "granted",
    description: "Pull-up tracker",
  },
  {
    id: "interview-prep",
    label: "Interview prep",
    href: "/interview-prep",
    access: "granted",
    description: "SQL / interview course",
  },
  {
    id: "finance",
    label: "Finance",
    href: "/finance",
    access: "granted",
    description: "Savings and KiwiSaver calculators",
  },
] as const satisfies readonly Feature[]

export type FeatureId = (typeof FEATURES)[number]["id"]

/** The features that have to be granted per member. */
export const GRANTABLE_FEATURES = FEATURES.filter((f) => f.access === "granted")

const GRANTABLE_IDS = new Set<string>(GRANTABLE_FEATURES.map((f) => f.id))

/** Drops unknown or public ids, de-duplicates, and sorts, so a list can be
 * stored, or compared with one in a token, without spurious differences. */
export function normaliseFeatures(ids: readonly unknown[] | null | undefined): FeatureId[] {
  if (!Array.isArray(ids)) return []
  return [...new Set(ids.filter((id): id is FeatureId => typeof id === "string" && GRANTABLE_IDS.has(id)))].sort()
}

export function getFeature(id: FeatureId): Feature {
  return FEATURES.find((f) => f.id === id)!
}

/** Whether someone with these grants (or admin) can use a feature. */
export function canUse(id: FeatureId, grants: readonly string[], isAdmin: boolean): boolean {
  const feature = getFeature(id)
  return feature.access === "public" || isAdmin || grants.includes(id)
}
