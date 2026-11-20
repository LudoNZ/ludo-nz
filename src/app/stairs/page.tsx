import { Suspense } from "react"
import StairsRoute from "./linkedStairsPage"

export default function Page() {
  return (
    <Suspense fallback={<p style={{ padding: "3rem 1rem", textAlign: "center", opacity: 0.75 }}>Loading…</p>}>
      <StairsRoute />
    </Suspense>
  )
}
