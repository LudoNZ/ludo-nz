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
  MAX_LOGO_CHARS,
  STALE_AFTER_DAYS,
  withPolePriceList,
} from "@/components/retainingWall/pricing"
import type { LibraryStatus } from "@/components/retainingWall/usePriceLibrary"
import styles from "./priceLibraryModal.module.scss"

const SAVE_DELAY_MS = 800

const DEFAULT_UNIT: Record<PriceCategory, PriceUnit> = {
  posts: "m",
  boards: "m",
  topCap: "m",
  timber: "m",
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

/** Reads an image file and shrinks it to fit LOGO_BOX, as a PNG (or a
 * JPEG if the PNG is too big), small enough to keep with the profile. */
const LOGO_BOX = { w: 600, h: 300 }
async function shrinkLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error("That file isn't an image this browser can read."))
      i.src = url
    })
    const scale = Math.min(1, LOGO_BOX.w / img.naturalWidth, LOGO_BOX.h / img.naturalHeight)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
    let data = canvas.toDataURL("image/png")
    if (data.length > MAX_LOGO_CHARS) {
      // JPEG has no transparency: put it on white
      const ctx = canvas.getContext("2d")!
      ctx.globalCompositeOperation = "destination-over"
      ctx.fillStyle = "#fff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      data = canvas.toDataURL("image/jpeg", 0.85)
    }
    if (data.length > MAX_LOGO_CHARS) throw new Error("That logo is too detailed to keep. Try a simpler or smaller image.")
    return data
  } finally {
    URL.revokeObjectURL(url)
  }
}

const LogoField: React.FC<{ value: string; onChange: (logo: string) => void }> = ({ value, onChange }) => {
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className={styles.logoField}>
      <span>Logo</span>
      <div className={styles.logoRow}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL, nothing for next/image to optimise */}
        <div className={styles.logoPreview}>{value ? <img src={value} alt="Your logo" /> : <span>No logo</span>}</div>
        <label className={styles.secondary}>
          {value ? "Change logo" : "Upload logo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (!file) return
              setErr(null)
              try {
                onChange(await shrinkLogo(file))
              } catch (x) {
                setErr(x instanceof Error ? x.message : "Couldn't read that image.")
              }
            }}
          />
        </label>
        {value && (
          <button type="button" className={styles.remove} onClick={() => onChange("")}>
            Remove
          </button>
        )}
      </div>
      <span className={styles.hint}>PNG or JPEG, ideally on a transparent or white background. It&apos;s shrunk to fit before saving.</span>
      {err && <span className={styles.error}>{err}</span>}
    </div>
  )
}

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
  /** signed in: can change the library */
  canEdit: boolean
  /** signed in: can keep company details */
  signedIn: boolean
  onSave: (next: PriceLibrary) => void
  /** item ids in use on the wall being priced, to mark them */
  inUse?: Set<string>
  initialTab?: "prices" | "company"
}> = ({ isOpen, onClose, library, status, error, canEdit, signedIn, onSave, inUse, initialTab = "prices" }) => {
  const [draft, setDraft] = useState<PriceLibrary>(library)
  const [tab, setTab] = useState<"prices" | "company">(initialTab)
  const [onlyStale, setOnlyStale] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // the prices and the company details save separately, so editing one
  // never writes a stale copy of the other
  const dirty = useRef({ items: false, company: false })
  const draftRef = useRef(draft)
  draftRef.current = draft
  const libraryRef = useRef(library)
  libraryRef.current = library
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  // fresh from the library each time it's opened (and when it loads),
  // keeping whichever part has unsaved edits
  useEffect(() => {
    if (!isOpen) return
    setDraft((d) => ({ items: dirty.current.items ? d.items : library.items, company: dirty.current.company ? d.company : library.company }))
  }, [isOpen, library])
  useEffect(() => {
    if (isOpen) setTab(initialTab)
  }, [isOpen, initialTab])

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const { items, company } = dirty.current
    if (items || company) {
      dirty.current = { items: false, company: false }
      onSaveRef.current({
        items: items ? draftRef.current.items : libraryRef.current.items,
        company: company ? draftRef.current.company : libraryRef.current.company,
      })
    }
  }
  useEffect(() => () => flush(), [])

  const update = (next: PriceLibrary) => {
    if (next.items !== draft.items) dirty.current.items = true
    if (next.company !== draft.company) dirty.current.company = true
    setDraft(next)
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
          <button
            type="button"
            role="tab"
            aria-selected={tab === "company"}
            className={tab === "company" ? styles.tabOn : ""}
            onClick={() => setTab("company")}
          >
            Your company
          </button>
        </div>

        <p className={styles.sync}>
          {tab === "company"
            ? signedIn
              ? "Your own company details and logo, on your proposals only. Saved to your account as you go."
              : "Sign in to set up your company details and logo for your proposals."
            : status === "loading"
              ? "Loading the price library…"
              : status === "offline"
                ? "Offline: showing the library as last loaded on this device."
                : status === "error"
                  ? "Couldn't load the price library; showing the last one loaded on this device."
                  : canEdit
                    ? "Shared prices: everyone's estimates use these. Saved as you go."
                    : "Shared prices: everyone's estimates use these. Sign in to change them."}
          {error && <span className={styles.error}> {error}</span>}
        </p>

        {tab === "prices" && (
          <>
            {staleItems.length > 0 ? (
              <div className={styles.staleBanner}>
                <span>
                  ⚠ {staleItems.length} price{staleItems.length === 1 ? " hasn't" : "s haven't"} been confirmed in the last 3 months ({STALE_AFTER_DAYS} days).
                  Check {staleItems.length === 1 ? "it" : "them"} with your supplier, then update or confirm.
                </span>
                <span className={styles.bannerButtons}>
                  <label className={styles.check}>
                    <input type="checkbox" checked={onlyStale} onChange={(e) => setOnlyStale(e.target.checked)} /> Show only these
                  </label>
                  {canEdit && (
                    <button type="button" className={styles.secondary} onClick={confirmAll}>
                      Confirm all {staleItems.length} as still right
                    </button>
                  )}
                </span>
              </div>
            ) : (
              <p className={styles.allGood}>✓ Every price has been confirmed in the last 3 months.</p>
            )}

            <fieldset className={styles.readOnlyWrap} disabled={!canEdit}>
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
                          {(cat.id === "posts" || cat.id === "timber") && (
                            <label className={styles.sizeField}>
                              <span>{cat.id === "posts" ? "Post size" : "Size"}</span>
                              <input
                                value={item.sizeLabel ?? ""}
                                list={cat.id === "posts" ? "priceLibraryPostSizes" : undefined}
                                placeholder={cat.id === "posts" ? "Any size" : "e.g. 140 x 45"}
                                onChange={(e) => setItem(item.id, { sizeLabel: e.target.value || undefined })}
                              />
                            </label>
                          )}
                          {cat.id === "posts" && (
                            <label className={styles.unitField}>
                              <span>Priced</span>
                              <select
                                value={item.lengthPrices ? "length" : "metre"}
                                onChange={(e) =>
                                  setItem(
                                    item.id,
                                    e.target.value === "length"
                                      ? { lengthPrices: [{ lengthM: 2.4, price: 0 }], unit: "each" }
                                      : { lengthPrices: undefined, unit: "m" },
                                  )
                                }
                              >
                                <option value="metre">per metre</option>
                                <option value="length">by length</option>
                              </select>
                            </label>
                          )}
                          {item.lengthPrices ? (
                            <div className={styles.lengthPrices}>
                              <span>Price per post by length (excl GST); a post is priced at the shortest length it fits in</span>
                              <ul>
                                {item.lengthPrices.map((lp, li) => {
                                  const setRow = (patch: Partial<typeof lp>) =>
                                    setItem(item.id, { lengthPrices: item.lengthPrices!.map((r, j) => (j === li ? { ...r, ...patch } : r)) }, true)
                                  return (
                                    <li key={li}>
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        min={0.1}
                                        step={0.1}
                                        aria-label="Length in metres"
                                        value={lp.lengthM}
                                        onChange={(e) => {
                                          const n = Number(e.target.value)
                                          if (n > 0) setRow({ lengthM: n })
                                        }}
                                      />
                                      <span>m</span>
                                      <span className={styles.money}>
                                        $
                                        <input
                                          type="number"
                                          inputMode="decimal"
                                          min={0}
                                          step={0.01}
                                          aria-label={`Price for ${lp.lengthM} m`}
                                          value={lp.price}
                                          onChange={(e) => {
                                            const n = Number(e.target.value)
                                            if (e.target.value.trim() !== "" && n >= 0) setRow({ price: n })
                                          }}
                                        />
                                      </span>
                                      <button
                                        type="button"
                                        className={styles.remove}
                                        aria-label={`Remove ${lp.lengthM} m`}
                                        onClick={() => setItem(item.id, { lengthPrices: item.lengthPrices!.filter((_, j) => j !== li) })}
                                      >
                                        ✕
                                      </button>
                                    </li>
                                  )
                                })}
                              </ul>
                              <button
                                type="button"
                                className={styles.secondary}
                                onClick={() => {
                                  const longest = Math.max(0, ...item.lengthPrices!.map((r) => r.lengthM))
                                  setItem(item.id, { lengthPrices: [...item.lengthPrices!, { lengthM: Number((longest + 0.6).toFixed(1)), price: 0 }] })
                                }}
                              >
                                + Length
                              </button>
                            </div>
                          ) : (
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
                          )}
                          {!item.lengthPrices && (
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
                          )}
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
                            <input
                              value={item.supplier ?? ""}
                              placeholder="Optional"
                              onChange={(e) => setItem(item.id, { supplier: e.target.value || undefined })}
                            />
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
                    {!onlyStale && cat.id === "posts" && (
                      <button
                        type="button"
                        className={styles.add}
                        title="Round posts 150–274 SED, priced by length, from the supplier price list of 19 Nov 2026. Replaces an earlier copy of the list."
                        onClick={() => update({ ...draft, items: withPolePriceList(draft.items) })}
                      >
                        {draft.items.some((i) => i.id.startsWith("pole-sed-"))
                          ? "↻ Reset round pole prices to the supplier list"
                          : "+ Add supplier round pole prices (150–274 SED)"}
                      </button>
                    )}
                  </section>
                )
              })}
            </fieldset>
            <datalist id="priceLibraryPostSizes">
              {POST_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </>
        )}

        {tab === "company" && (
          <fieldset className={`${styles.readOnlyWrap} ${styles.company}`} disabled={!signedIn}>
            <p className={styles.hint}>Printed on your proposals. Anything left blank shows as a placeholder to fill in.</p>
            <LogoField value={company.logo} onChange={(logo) => update({ ...draft, company: { ...company, logo } })} />
            {COMPANY_FIELDS.map((f) => (
              <label key={f.key} className={styles.companyField}>
                <span>{f.label}</span>
                {f.multiline ? (
                  <textarea
                    rows={2}
                    value={company[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => update({ ...draft, company: { ...company, [f.key]: e.target.value } })}
                  />
                ) : (
                  <input
                    value={company[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => update({ ...draft, company: { ...company, [f.key]: e.target.value } })}
                  />
                )}
              </label>
            ))}
          </fieldset>
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
