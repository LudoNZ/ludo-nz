"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/context/auth"
import { CALCULATOR_STATUSES, CALCULATORS, CalculatorStatus, CalculatorStatuses } from "@/lib/calculators"
import { saveCalculatorStatuses } from "./calculatorStatusActions"
import styles from "./calculatorStatusSection.module.scss"

/** Admin dashboard: a matrix of every calculator against the sections of
 * /calculators — Ready, In development, Coming soon, or Hidden (admins
 * only). Saves on each change. */
export default function CalculatorStatusSection({ initial }: { initial: CalculatorStatuses }) {
  const auth = useAuth()
  const [value, setValue] = useState<CalculatorStatuses>(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  useEffect(() => setValue(initial), [initial])

  const change = async (id: string, next: CalculatorStatus) => {
    if (!auth?.currentUser || value[id] === next) return
    const previous = value
    setValue({ ...value, [id]: next })
    setBusy(id)
    setStatus(null)
    try {
      setValue(await saveCalculatorStatuses(await auth.currentUser.getIdToken(), { ...value, [id]: next }))
      const title = CALCULATORS.find((c) => c.id === id)!.title
      const label = CALCULATOR_STATUSES.find((s) => s.value === next)!.label
      setStatus({ kind: "ok", text: `${title} is now ${label.toLowerCase()}.` })
    } catch (e) {
      setValue(previous)
      setStatus({ kind: "error", text: e instanceof Error ? e.message : "Couldn't save that change" })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={styles.calculatorStatusSection}>
      <div className={styles.header}>
        <h2>Calculators</h2>
        <p>
          Which section each calculator sits in on the Calculators page. Hidden ones only show for you, as
          ideas not yet public.
        </p>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th scope="col" className={styles.nameCol}>
                Calculator
              </th>
              {CALCULATOR_STATUSES.map((s) => (
                <th key={s.value} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CALCULATORS.map((c) => (
              <tr key={c.id}>
                <th scope="row" className={styles.nameCol}>
                  <span className={styles.label}>{c.title}</span>
                  {!c.href && <span className={styles.hint}>No page yet</span>}
                </th>
                {CALCULATOR_STATUSES.map((s) => (
                  <td key={s.value}>
                    <input
                      type="radio"
                      name={`calc-${c.id}`}
                      aria-label={`${c.title}: ${s.label}`}
                      checked={value[c.id] === s.value}
                      disabled={busy !== null}
                      onChange={() => change(c.id, s.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={status?.kind === "error" ? styles.error : styles.status} aria-live="polite">
        {busy ? "Saving..." : status?.text}
      </p>
    </section>
  )
}
