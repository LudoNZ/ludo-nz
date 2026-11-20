/** Adds Bunnings NZ prices for the stair materials to the shared price
 * library (retainingWallPriceLibrary/shared), leaving every other item
 * alone. Prices are as shown on bunnings.co.nz on 20 Nov 2026 (incl GST),
 * stored excl GST. Running it again replaces these items' prices.
 *
 *   npx tsx --env-file=.env.local scripts/addBunningsStairPrices.ts
 *
 * Needs the Firebase Admin credentials from .env.local. */
import { FieldValue } from "firebase-admin/firestore"
import { getFirestoreAdmin } from "../firebase/server"
import { libraryFromData, PriceItem } from "../src/components/retainingWall/pricing"

const GST = 1.15
const now = new Date().toISOString()
const exGst = (incl: number) => Math.round((incl / GST) * 100) / 100

const ITEMS: PriceItem[] = [
  // I/N 0616262, $70.91 a 6 m length = $11.82/m incl GST
  { id: "bunnings-140x45-h32", category: "timber", name: "140 x 45 SG8 H3.2 green framing (Bunnings 0616262)", sizeLabel: "140 x 45", unit: "m", price: exGst(11.82), supplier: "Bunnings NZ", confirmedAt: now },
  // I/N 0616628, $108.12 a 6 m length = $18.02/m incl GST
  { id: "bunnings-190x45-h32", category: "timber", name: "190 x 45 SG8 H3.2 green framing (Bunnings 0616628)", sizeLabel: "190 x 45", unit: "m", price: exGst(18.02), supplier: "Bunnings NZ", confirmedAt: now },
  // I/N 0276480, 140 x 19 radiata H3.2, $4.23/m incl GST — the stairs' 140 x 20 boards
  { id: "bunnings-140x20-decking", category: "timber", name: "140 x 19 radiata H3.2 decking (Bunnings 0276480)", sizeLabel: "140 x 20", unit: "m", price: exGst(4.23), supplier: "Bunnings NZ", confirmedAt: now },
  // Zenith 10g x 65 SS304, 250 pack, $34.50 incl GST (from a search listing — the page didn't load, so not confirmed)
  { id: "bunnings-deck-screws", category: "fixings", name: "Stainless decking screws 10g x 65 (Zenith 250 pack, Bunnings 0663422)", unit: "each", price: exGst(34.5 / 250), supplier: "Bunnings NZ", confirmedAt: null },
]

async function main() {
  const ref = getFirestoreAdmin().collection("retainingWallPriceLibrary").doc("shared")
  const snap = await ref.get()
  // what's stored, as stored (nothing dropped or rewritten); the starter
  // library if there's none yet
  const stored = snap.data()?.items
  const items: { id?: unknown }[] = Array.isArray(stored) ? stored : libraryFromData(undefined).items
  const ids = new Set(ITEMS.map((i) => i.id))
  const next = [...items.filter((i) => !ids.has(String(i.id))), ...ITEMS]
  await ref.set({ items: next, updatedAt: FieldValue.serverTimestamp(), updatedBy: "Bunnings stair prices script" }, { merge: true })
  console.log(`Price library: ${items.length} items before, ${next.length} after.`)
  for (const i of ITEMS) console.log(`  ${i.name}: $${i.price} excl GST per ${i.unit}`)
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err)
    process.exit(1)
  },
)
