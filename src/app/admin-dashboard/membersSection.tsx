"use client"

import { FormEvent, useCallback, useEffect, useState } from "react"
import { useAuth } from "@/context/auth"
import { FeatureId, FEATURES } from "@/lib/features"
import { useSiteAccess } from "@/context/siteAccess"
import {
  AccountRow,
  createInvite,
  deleteMember,
  grantAccount,
  listMembers,
  MemberRow,
  setMemberFeatures,
  setMemberRevoked,
} from "./memberActions"
import styles from "./membersSection.module.scss"

const inviteLink = (id: string) => `${window.location.origin}/register?invite=${id}`

const formatDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "never"

const providerLabel = (p: string) => (p === "google.com" ? "Google" : p === "password" ? "Password" : p)

function FeatureChecks({
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  value: FeatureId[]
  onChange: (next: FeatureId[]) => void
  disabled?: boolean
  idPrefix: string
}) {
  const siteAccess = useSiteAccess()
  return (
    <div className={styles.features}>
      {FEATURES.map((f) => {
        const id = `${idPrefix}-${f.id}`
        const checked = value.includes(f.id)
        return (
          <label key={f.id} htmlFor={id} className={styles.featureCheck} title={f.description}>
            <input
              id={id}
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(checked ? value.filter((v) => v !== f.id) : [...value, f.id])}
            />
            {f.label}
            {siteAccess[f.id] !== "granted" && (
              <span className={styles.featureNote}>({siteAccess[f.id] === "public" ? "public" : "hidden"})</span>
            )}
          </label>
        )
      })}
    </div>
  )
}

function CopyButton({ text, label = "Copy invite link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={styles.smallBtn}
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? "Copied" : label}
    </button>
  )
}

/** Admin dashboard: invite people, choose which features each one gets,
 * revoke access, and let in accounts that exist but have no access. */
export default function MembersSection() {
  const auth = useAuth()
  const user = auth?.currentUser ?? null
  const [members, setMembers] = useState<MemberRow[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<string | null>(null)

  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [newFeatures, setNewFeatures] = useState<FeatureId[]>([])
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [inviteError, setInviteError] = useState("")
  const [justInvited, setJustInvited] = useState<{ email: string; id: string; expiresAt: string } | null>(null)
  const [grantFeatures, setGrantFeatures] = useState<Record<string, FeatureId[]>>({})

  const token = useCallback(() => {
    if (!user) throw new Error("Not signed in")
    return user.getIdToken()
  }, [user])

  const refresh = useCallback(async () => {
    try {
      const result = await listMembers(await token())
      setMembers(result.members)
      setAccounts(result.accounts)
      setError("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load members")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (user) refresh()
  }, [user, refresh])

  /** run an action for one row, then reload the list */
  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key)
    try {
      await action()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work")
    } finally {
      setBusy(null)
    }
  }

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault()
    setInviteError("")
    setBusy("invite")
    try {
      const result = await createInvite(await token(), { email, name, features: newFeatures, expiresInDays })
      if (!result.ok) {
        setInviteError(result.error)
        return
      }
      setJustInvited({ email: email.trim().toLowerCase(), id: result.id, expiresAt: result.expiresAt })
      setEmail("")
      setName("")
      setNewFeatures([])
      await refresh()
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "Couldn't create the invite")
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={styles.membersSection}>
      <div className={styles.header}>
        <h2>Members</h2>
      </div>

      <form className={styles.inviteForm} onSubmit={handleInvite}>
        <h3>Invite someone</h3>
        <div className={styles.inviteFields}>
          <input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email to invite"
          />
          <input
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Name"
          />
          <label className={styles.expiry}>
            Link works for
            <select value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value))}>
              {[1, 3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d} day{d === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={styles.muted}>
          Leave the email blank for a link anyone can use once: they enter their own name and email. The link is a long
          random code, and stops working once used or when it expires.
        </p>
        <FeatureChecks value={newFeatures} onChange={setNewFeatures} idPrefix="new" />
        {inviteError && <p className={styles.error}>{inviteError}</p>}
        <button type="submit" className={styles.primaryBtn} disabled={busy === "invite"}>
          {busy === "invite" ? "Creating..." : "Create invite"}
        </button>
        {justInvited && (
          <div className={styles.inviteReady}>
            <p>
              {justInvited.email ? (
                <>
                  Invite for <strong>{justInvited.email}</strong> is ready.
                </>
              ) : (
                "Invite link is ready: one sign-up, they enter their own name and email."
              )}{" "}
              It works until {formatDate(justInvited.expiresAt)}. Send them this link:
            </p>
            <code className={styles.link}>{inviteLink(justInvited.id)}</code>
            <CopyButton text={inviteLink(justInvited.id)} label="Copy link" />
          </div>
        )}
      </form>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p className={styles.muted}>Loading members...</p>
      ) : (
        <>
          {members.length === 0 ? (
            <p className={styles.muted}>No one invited yet.</p>
          ) : (
            <ul className={styles.list}>
              {members.map((m) => (
                <li key={m.id} className={`${styles.row} ${m.status === "revoked" ? styles.revoked : ""}`}>
                  <div className={styles.who}>
                    <span className={styles.email}>{m.email || "Open invite (they enter their email)"}</span>
                    {m.name && <span className={styles.name}>{m.name}</span>}
                    <span className={`${styles.badge} ${styles[m.status]}`}>{m.status}</span>
                  </div>
                  <div className={styles.meta}>
                    {m.status === "invited"
                      ? `Invited ${formatDate(m.invitedAt)}${
                          m.expiresAt
                            ? new Date(m.expiresAt).getTime() < Date.now()
                              ? ` · link expired ${formatDate(m.expiresAt)}`
                              : ` · link works until ${formatDate(m.expiresAt)}`
                            : ""
                        }`
                      : `Joined ${formatDate(m.acceptedAt)} · last sign-in ${formatDate(m.lastSignInAt)}${
                          m.providers.length ? ` · ${m.providers.map(providerLabel).join(", ")}` : ""
                        }`}
                  </div>
                  <FeatureChecks
                    value={m.features}
                    disabled={busy === m.id}
                    idPrefix={m.id}
                    onChange={(next) => {
                      setMembers((rows) => rows.map((r) => (r.id === m.id ? { ...r, features: next } : r)))
                      run(m.id, async () => setMemberFeatures(await token(), m.id, next))
                    }}
                  />
                  <div className={styles.actions}>
                    {m.status === "invited" && !(m.expiresAt && new Date(m.expiresAt).getTime() < Date.now()) && (
                      <CopyButton text={inviteLink(m.id)} />
                    )}
                    {m.status !== "revoked" ? (
                      <button
                        type="button"
                        className={styles.smallBtn}
                        disabled={busy === m.id}
                        onClick={() => run(m.id, async () => setMemberRevoked(await token(), m.id, true))}
                      >
                        {m.status === "invited" ? "Cancel invite" : "Revoke access"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.smallBtn}
                        disabled={busy === m.id}
                        onClick={() => run(m.id, async () => setMemberRevoked(await token(), m.id, false))}
                      >
                        Restore
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${styles.smallBtn} ${styles.danger}`}
                      disabled={busy === m.id}
                      onClick={() => {
                        if (
                          confirm(`Remove ${m.email || "this invite"} from members? Their account and data are kept.`)
                        ) {
                          run(m.id, async () => deleteMember(await token(), m.id))
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {accounts.length > 0 && (
            <>
              <h3 className={styles.subheading}>Accounts without access</h3>
              <p className={styles.muted}>
                Signed up before logins were invite only, or tried to sign in without an invite. They can&apos;t get in
                until you grant access.
              </p>
              <ul className={styles.list}>
                {accounts.map((a) => (
                  <li key={a.uid} className={styles.row}>
                    <div className={styles.who}>
                      <span className={styles.email}>{a.email ?? a.uid}</span>
                      {a.name && <span className={styles.name}>{a.name}</span>}
                    </div>
                    <div className={styles.meta}>
                      Created {formatDate(a.createdAt)} · last sign-in {formatDate(a.lastSignInAt)}
                      {a.providers.length ? ` · ${a.providers.map(providerLabel).join(", ")}` : ""}
                    </div>
                    <FeatureChecks
                      value={grantFeatures[a.uid] ?? []}
                      onChange={(next) => setGrantFeatures((g) => ({ ...g, [a.uid]: next }))}
                      idPrefix={a.uid}
                    />
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.smallBtn}
                        disabled={busy === a.uid}
                        onClick={() =>
                          run(a.uid, async () => grantAccount(await token(), a.uid, grantFeatures[a.uid] ?? []))
                        }
                      >
                        Grant access
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}
