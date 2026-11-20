// Server-only: imports the Admin SDK. Never import this from a client component.
import { unstable_cache } from "next/cache"
import { getFirestoreAdmin } from "../../firebase/server"
import { CalculatorStatuses, DEFAULT_CALCULATOR_STATUSES, normaliseCalculatorStatuses } from "./calculators"

/** `settings/calculators`: `{ statuses: { [calculatorId]: "ready" |
 * "development" | "soon" | "hidden" }, updatedAt }`. Only the Admin SDK
 * touches it; Firestore rules deny clients (the catch-all deny). */
export const CALCULATOR_STATUS_TAG = "calculator-status"

export function calculatorStatusRef() {
  return getFirestoreAdmin().collection("settings").doc("calculators")
}

/** One Firestore read, then served from Next's data cache until the admin
 * saves a change (which revalidates the tag) or an hour passes. */
const readCalculatorStatuses = unstable_cache(
  async (): Promise<CalculatorStatuses> => {
    const snap = await calculatorStatusRef().get()
    return normaliseCalculatorStatuses(snap.data()?.statuses)
  },
  ["calculator-status"],
  { tags: [CALCULATOR_STATUS_TAG], revalidate: 3600 },
)

/** Each calculator's section. Falls back to the defaults if Firestore
 * can't be read (the failure isn't cached, so the next render retries). */
export async function getCalculatorStatuses(): Promise<CalculatorStatuses> {
  try {
    return await readCalculatorStatuses()
  } catch (err) {
    console.error("Reading calculator statuses failed; using defaults:", err)
    return { ...DEFAULT_CALCULATOR_STATUSES }
  }
}
