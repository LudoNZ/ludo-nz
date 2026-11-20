"use server"

import { FieldValue } from "firebase-admin/firestore"
import { revalidateTag } from "next/cache"
import { CalculatorStatuses, normaliseCalculatorStatuses } from "@/lib/calculators"
import { requireAdmin } from "@/lib/members.server"
import { CALCULATOR_STATUS_TAG, calculatorStatusRef } from "@/lib/calculatorStatus.server"

/** Save which section each calculator sits in on /calculators. Clears the
 * cached copy so the page (and this dashboard) pick it up on next load. */
export async function saveCalculatorStatuses(
  idToken: string,
  statuses: Partial<Record<string, string>>,
): Promise<CalculatorStatuses> {
  await requireAdmin(idToken)
  const normalised = normaliseCalculatorStatuses(statuses)
  await calculatorStatusRef().set({ statuses: normalised, updatedAt: FieldValue.serverTimestamp() })
  revalidateTag(CALCULATOR_STATUS_TAG)
  return normalised
}
