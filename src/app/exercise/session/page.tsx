import { Suspense } from "react"
import SessionPage from "./sessionPage"

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SessionPage />
    </Suspense>
  )
}
