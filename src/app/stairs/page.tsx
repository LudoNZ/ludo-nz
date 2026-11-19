import { Suspense } from "react"
import StairsPage from "./stairsPage"
import StairsRoute from "./linkedStairsPage"

export default function Page() {
  return (
    <Suspense fallback={<StairsPage />}>
      <StairsRoute />
    </Suspense>
  )
}
