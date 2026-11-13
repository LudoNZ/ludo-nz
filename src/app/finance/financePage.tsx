"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import SavingsCalculator from "@/components/finance/savingsCalculator"
import KiwiSaverCalculator from "@/components/finance/kiwiSaverCalculator"
import styles from "./financePage.module.scss"

type Tab = "savings" | "kiwisaver"

/** Admin-only for now: NZ bank savings and KiwiSaver compound-interest
 * calculators, side by side as tabs. */
const FinancePage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("savings")
  const isAdmin = !!auth?.customClaims?.admin

  useEffect(() => {
    if (auth && !auth.authLoading && !isAdmin) router.push("/")
  }, [auth, isAdmin, router])

  useEffect(() => {
    if (window.location.hash === "#kiwisaver") setTab("kiwisaver")
  }, [])

  const choose = (t: Tab) => {
    setTab(t)
    history.replaceState(null, "", t === "kiwisaver" ? "#kiwisaver" : location.pathname)
  }

  if (!isAdmin) return <main className={styles.financePage} />

  return (
    <main className={styles.financePage}>
      <h1>Finance</h1>
      <div className={styles.tabs} role="tablist">
        <button role="tab" aria-selected={tab === "savings"} className={tab === "savings" ? styles.tabActive : ""} onClick={() => choose("savings")}>
          Bank savings
        </button>
        <button role="tab" aria-selected={tab === "kiwisaver"} className={tab === "kiwisaver" ? styles.tabActive : ""} onClick={() => choose("kiwisaver")}>
          KiwiSaver
        </button>
      </div>
      {tab === "savings" ? <SavingsCalculator /> : <KiwiSaverCalculator />}
    </main>
  )
}

export default FinancePage
