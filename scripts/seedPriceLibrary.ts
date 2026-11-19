/** Seeds the shared retaining wall price library
 * (retainingWallPriceLibrary/shared) with the starter prices, including
 * the round pole price list. Leaves an existing library alone unless run
 * with --force, which overwrites it.
 *
 *   npm run seed:prices            # only if it isn't there yet
 *   npm run seed:prices -- --force # replace whatever's there
 *
 * Needs the Firebase Admin credentials from .env.local. */
import { FieldValue } from "firebase-admin/firestore"
import { getFirestoreAdmin } from "../firebase/server"
import { libraryFromData } from "../src/components/retainingWall/pricing"

async function main() {
  const ref = getFirestoreAdmin().collection("retainingWallPriceLibrary").doc("shared")
  const force = process.argv.includes("--force")
  if ((await ref.get()).exists && !force) {
    console.log("The price library is already there; left alone. Run with --force to replace it.")
    return
  }
  const library = libraryFromData(undefined)
  await ref.set({ ...library, updatedAt: FieldValue.serverTimestamp(), updatedBy: "seed script" })
  console.log(`Seeded the price library: ${library.items.length} items.`)
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err)
    process.exit(1)
  },
)
