"use client"

import { useEffect, useRef, useState } from "react"
import { Modal } from "@/app/elements/Modal/modal"
import { POST_SIZE_OPTIONS } from "@/components/retainingWall/calcSettings"
import {
  BLANK_COMPANY,
  CompanyDetails,
  describeAge,
  isStale,
  newPriceId,
  PRICE_CATEGORIES,
  PRICE_UNITS,
  PriceCategory,
  PriceItem,
  PriceLibrary,
  PriceUnit,
  STALE_AFTER_DAYS,
} from "@/components/retainingWall/pricing"
import type { LibraryStatus } from "@/components/retainingWall/usePriceLibrary"
import styles from "./priceLibraryModal.module.scss"

const SAVE_DELAY_MS = 800

const DEFAULT_UNIT: Record<PriceCategory, PriceUnit> = {
  posts: "m",
  boards: "m",
  topCap: "m",
  concrete: "m³",
  gravel: "m³",
  labour: "hour",
  fixings: "m",
  drainage: "m",
  other: "each",
}

const COMPANY_FIELDS: { key: keyof CompanyDetails; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: "name", label: "Company name", placeholder: "Your Company Ltd" },
  { key: "tagline", label: "Tagline", placeholder: "Landscaping & retaining walls" },
  { key: "address", label: "Address", placeholder: "123 Example Road, Town", multiline: true },
  { key: "phone", label: "Phone", placeholder: "021 000 0000" },
  { key: "email", label: "Email", placeholder: "hello@yourcompany.co.nz" },
  { key: "website", label: "Website", placeholder: "yourcompany.co.nz" },
  { key: "gstNumber", label: "GST number", placeholder: "123-456-789" },
  { key: "paymentTerms", label: "Payment terms", placeholder: "50% deposit on acceptance, balance on completion", multiline: true },
]

/** The price library: every material and labour price an estimate uses,
 * each with when it was last confirmed. A price over three months old,
 * or never confirmed, is flagged here and on every estimate that uses it.
 * Changing a price counts as confirming it; "Confirm" re-dates one that's
 * still right. Also holds the company details printed on proposals.
 * Saves as you go. */
const PriceLibraryModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  library: PriceLibrary
  status: LibraryStatus
  error: string | null
  signedIn: boolean
  onSave: (next: PriceLibrary) => void
  /** item ids in use on the wall being priced, to mark them */
  inUse?: Set<string>
  initialTab?: "prices" | "company"
}> = ({ isOpen, onClose, library, status, error, signedIn, onSave, inUse, initialTab = "prices" }) => {
  const [draft, setDraft] = useState<PriceLibrary>(library)
  const [tab, setTab] = useState<"prices" | "company">(initialTab)
  const [onlyStale, setOnlyStale] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  // fresh from the library each time it's opened (and when it loads)
  useEffect(() => {
    if (isOpen && !dirty.current) setDraft(library)
  }, [isOpen, library])
  useEffect(() => {
    if (isOpen) setTab(initialTab)
  }, [isOpen, initialTab])

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (dirty.current) {
      dirty.current = false
      onSaveRef.current(draftRef.current)
    }
  }
  useEffect(() => () => flush(), [])

  const update = (next: PriceLibrary) => {
    setDraft(next)
    dirty.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY_MS)
  }
  const close = () => {
    flush()
    onClose()
  }

  const now = new Date().toISOString()
  const setItem = (id: string, patch: Partial<PriceItem>, confirms = false) =>
    update({ ...draft, items: draft.items.map((i) => (i.id === id ? { ...i, ...patch, ...(confirms ? { confirmedAt: now } : {}) } : i)) })
  const addItem = (category: PriceCategory) =>
    update({
      ...draft,
      items: [...draft.items, { id: newPriceId(), category, name: "", unit: DEFAULT_UNIT[category], price: 0, confirmedAt: null }],
    })
  const removeItem = (id: string) => update({ ...draft, items: draft.items.filter((i) => i.id !== id) })

  const staleItems = draft.items.filter((i) => isStale(i))
  const confirmAll = () => update({ ...draft, items: draft.items.map((i) => (isStale(i) ? { ...i, confirmedAt: now } : i)) })

  const company = { ...BLANK_COMPANY, ...draft.company }

  return (
    <Modal isActive={isOpen} closeModal={close}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h2>Price library</h2>
          <button type="button" className={styles.closeBtn} onClick={close} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={tab === "prices"} className={tab === "prices" ? styles.tabOn : ""} onClick={() => setTab("prices")}>
            Prices {staleItems.length > 0 && <span className={styles.badge}>{staleItems.length}</span>}
          </button>
          <button type="button" role="tab" aria-selected={tab === "company"} className={tab === "company" ? styles.tabOn : ""} onClick={() => setTab("company")}>
            Company details
          </button>
        </div>

        <p className={styles.sync}>
          {!signedIn
            ? "Signed out: this library is kept on this device only. Sign in to keep it with your account."
            : status === "loading"
              ? "Loading your library…"
              : status === "offline"
                ? "Offline: showing this device's copy."
                : status === "error"
                  ? "Couldn't load your library from your account; showing this device's copy."
                  : "Saved to your account as you go."}
          {error && <span className={styles.error}> {error}</span>}
        </p>

        {tab === "prices" && (
          <>
            {staleItems.length > 0 ? (
              <div className={styles.staleBanner}>
                <span>
                  ⚠ {staleItems.length} price{staleItems.length === 1 ? " hasn't" : "s haven't"} been confirmed in the last 3 months (
                  {STALE_AFTER_DAYS} days). Check {staleItems.length === 1 ? "it" : "them"} with your supplier, then update or confirm.
                </span>
                <span className={styles.bannerButtons}>
                  <label className={styles.check}>
                    <input type="checkbox" checked={onlyStale} onChange={(e) => setOnlyStale(e.target.checked)} /> Show only these
                  </label>
                  <button type="button" className={styles.secondary} onClick={confirmAll}>
                    Confirm all {staleItems.length} as still right
                  </button>
                </span>
              </div>
            ) : (
              <p className={styles.allGood}>✓ Every price has been confirmed in the last 3 months.</p>
            )}

            {PRICE_CATEGORIES.map((cat) => {
              const items = draft.items.filter((i) => i.category === cat.id && (!onlyStale || isStale(i)))
              if (onlyStale && items.length === 0) return null
              return (
                <section key={cat.id} className={styles.category}>
                  <div className={styles.categoryHead}>
                    <h3>{cat.label}</h3>
                    <span className={styles.hint}>{cat.hint}</span>
                  </div>
                  {items.length === 0 && <p className={styles.empty}>No prices yet.</p>}
                  {items.map((item) => {
                    const stale = isStale(item)
                    return (
                      <div key={item.id} className={`${styles.item} ${stale ? styles.itemStale : ""}`}>
                        <label className={styles.nameField}>
                          <span>Item</span>
                          <input value={item.name} placeholder="Description" onChange={(e) => setItem(item.id, { name: e.target.value })} />
                        </label>
                        {cat.id === "posts" && (
                          <label className={styles.sizeField}>
                            <span>Post size</span>
                            <input
                              value={item.sizeLabel ?? ""}
                              list="priceLibraryPostSizes"
                              placeholder="Any size"
                              onChange={(e) => setItem(item.id, { sizeLabel: e.target.value || undefined })}
                            />
                          </label>
                        )}
                        <label className={styles.priceField}>
                          <span>Price (excl GST)</span>
                          <span className={styles.money}>
                            $
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step={0.01}
                              value={Number.isFinite(item.price) ? item.price : 0}
                              onChange={(e) => {
                                const n = Number(e.target.value)
                                if (e.target.value.trim() !== "" && n >= 0) setItem(item.id, { price: n }, true)
                              }}
                            />
                          </span>
                        </label>
                        <label className={styles.unitField}>
                          <span>Unit</span>
                          <select value={item.unit} onChange={(e) => setItem(item.id, { unit: e.target.value as PriceUnit })}>
                            {PRICE_UNITS.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {item.unit === "bag" && (
                          <label className={styles.unitField}>
                            <span>m³ per bag</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0.001}
                              step={0.001}
                              value={item.bagYieldM3 ?? 0.01}
                              onChange={(e) => {
                                const n = Number(e.target.value)
                                if (n > 0) setItem(item.id, { bagYieldM3: n })
                              }}
                            />
                          </label>
                        )}
                        <label className={styles.supplierField}>
                          <span>Supplier</span>
                          <input value={item.supplier ?? ""} placeholder="Optional" onChange={(e) => setItem(item.id, { supplier: e.target.value || undefined })} />
                        </label>
                        <div className={styles.itemFoot}>
                          <span className={stale ? styles.ageStale : styles.age}>
                            {stale && "⚠ "}
                            {describeAge(item)}
                          </span>
                          {inUse?.has(item.id) && <span className={styles.inUse}>used on this wall</span>}
                          <span className={styles.itemButtons}>
                            <button type="button" className={styles.secondary} onClick={() => setItem(item.id, {}, true)} title="The price is still right">
                              Confirm
                            </button>
                            <button type="button" className={styles.remove} onClick={() => removeItem(item.id)} aria-label={`Remove ${item.name || "item"}`}>
                              Remove
                            </button>
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  {!onlyStale && (
                    <button type="button" className={styles.add} onClick={() => addItem(cat.id)}>
                      + Add {cat.label.toLowerCase()} price
                    </button>
                  )}
                </section>
              )
            })}
            <datalist id="priceLibraryPostSizes">
              {POST_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </>
        )}

        {tab === "company" && (
          <div className={styles.company}>
            <p className={styles.hint}>Printed on your proposals. Anything left blank shows as a placeholder to fill in.</p>
            {COMPANY_FIELDS.map((f) => (
              <label key={f.key} className={styles.companyField}>
                <span>{f.label}</span>
                {f.multiline ? (
                  <textarea rows={2} value={company[f.key]} placeholder={f.placeholder} onChange={(e) => update({ ...draft, company: { ...company, [f.key]: e.target.value } })} />
                ) : (
                  <input value={company[f.key]} placeholder={f.placeholder} onChange={(e) => update({ ...draft, company: { ...company, [f.key]: e.target.value } })} />
                )}
              </label>
            ))}
          </div>
        )}

        <div className={styles.footer}>
          <button type="button" className={styles.done} onClick={close}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default PriceLibraryModal
