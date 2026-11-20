"use client"

import { useCallback, useMemo, useState } from "react"
import { buildSiteEstimate, EstimateSettings, EstimateWall } from "@/components/retainingWall/pricing"
import { usePriceLibrary } from "@/components/retainingWall/usePriceLibrary"
import EstimateCard from "@/components/retainingWall/estimateCard"
import { finishScope, ProposalContent, ProposalDocument, wallScopeItems } from "@/components/retainingWall/proposalView"
import { totalLength } from "@/components/retainingWall/wallPlan"
import { siteDeckEstimate, siteDeckScope, SitePlaced, SiteProject, siteEstimateSettings, siteStairEstimate, siteStairScope, siteWallProfile } from "@/components/site/siteProject"
import { buildSiteScene } from "@/components/site/siteRender3d"
import PriceLibraryModal from "../retaining-walls/priceLibraryModal"
import styles from "./siteView.module.scss"

const lowerFirst = (s: string) => s.slice(0, 1).toLowerCase() + s.slice(1)

/** The whole job priced as one: every wall's posts, boards, concrete and
 * labour added up, every stair's timber, and the site's own markup,
 * extra lines and proposal — kept with the site project. */
const SiteEstimate: React.FC<{
  site: SiteProject
  placements: SitePlaced[]
  projectName: string
  onChange: (next: EstimateSettings) => void
}> = ({ site, placements, projectName, onChange }) => {
  const priceLibrary = usePriceLibrary()
  const [libraryOpen, setLibraryOpen] = useState<null | { tab: "prices" | "company" }>(null)
  const [proposalOpen, setProposalOpen] = useState(false)
  const closeProposal = useCallback(() => setProposalOpen(false), [])
  const settings = siteEstimateSettings(site)

  const built = site.walls.flatMap((w) => {
    const profile = siteWallProfile(w.wall)
    return profile ? [{ w, profile }] : []
  })
  const estimateWalls: EstimateWall[] = built.map(({ w, profile }) => ({
    name: w.name,
    profile,
    lengthM: totalLength(w.wall.planPoints),
    hasGravel: w.wall.calcSettings.gravelBaseAllowanceM > 0,
  }))
  const stairPlacements = placements.map((p) => p.placement)
  const decks = site.decks
  const estimate =
    estimateWalls.length || stairPlacements.length || decks.length
      ? buildSiteEstimate(estimateWalls, priceLibrary.library.items, settings, Date.now(), [...siteStairEstimate(stairPlacements), ...siteDeckEstimate(decks)])
      : null

  // the proposal's render, worked out once each time it's opened on a
  // new version of the site
  const scene = useMemo(
    () => (proposalOpen ? buildSiteScene(site.walls, placements, { azimuthDeg: -30, elevationDeg: 28 }, site.decks) : null),
    [proposalOpen, site.walls, placements, site.decks],
  )

  if (!estimate) return null

  const many = built.length > 1
  const scope = finishScope(
    built.flatMap(({ w, profile }) => {
      const items = wallScopeItems(profile, profile, w.wall.planPoints, w.wall.topCapEnabled)
      if (many) items[0] = `${w.name}: ${lowerFirst(items[0])}`
      const mine = placements.filter((p) => p.wall?.id === w.id).map((p) => p.placement)
      return [...items, ...siteStairScope(mine, profile.segments.length, many ? w.name : undefined)]
    }).concat(
      decks.flatMap((d) => [
        ...siteDeckScope([d]),
        ...siteStairScope(
          placements.filter((p) => p.deck?.id === d.id).map((p) => p.placement),
          1,
          d.name,
        ),
      ]),
    ),
    settings,
  )
  const lengthM = estimateWalls.reduce((a, w) => a + w.lengthM, 0)
  const stairs = stairPlacements.length
  const parts = [
    built.length ? (many ? `${built.length} timber pole retaining walls` : "a timber pole retaining wall") : "",
    decks.length ? (decks.length === 1 ? "a timber deck" : `${decks.length} timber decks`) : "",
    stairs ? (stairs === 1 ? "a timber stair" : `${stairs} timber stairs`) : "",
  ].filter(Boolean)
  const titleParts = [built.length ? `Timber retaining wall${many ? "s" : ""}` : "", decks.length ? `deck${decks.length > 1 ? "s" : ""}` : "", stairs ? "stairs" : ""].filter(Boolean)
  const captionParts = [
    built.length ? (many ? `${built.length} walls, ${lengthM.toFixed(1)} m in all` : `${lengthM.toFixed(1)} m of wall`) : "",
    decks.length ? `${decks.length} deck${decks.length > 1 ? "s" : ""}` : "",
    stairs ? `${stairs} stair${stairs > 1 ? "s" : ""}` : "",
  ].filter(Boolean)
  const joinAnd = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "")
  const title = joinAnd(titleParts)
  const content: ProposalContent = {
    title: title.slice(0, 1).toUpperCase() + title.slice(1),
    work: joinAnd(parts),
    scene,
    caption: `Proposed work: ${captionParts.join(", ")}. Illustration only — not to scale for setting out.`,
    scope,
    obstructions: built.filter(({ profile }) => profile.obstructions.length).map(({ w, profile }) => ({ wallName: many ? w.name : null, profile })),
  }

  return (
    <>
      <p className={styles.hint}>
        The whole job priced together: every wall, deck and stair, with the site&apos;s own markup, extra lines and
        proposal. (Each wall&apos;s own estimate, inside the wall, still prices that wall and its stairs on their own.)
      </p>
      <EstimateCard
        estimate={estimate}
        settings={settings}
        onChange={onChange}
        onOpenLibrary={() => setLibraryOpen({ tab: "prices" })}
        onOpenProposal={() => setProposalOpen(true)}
        libraryNote={
          priceLibrary.status === "offline"
            ? "Offline: using the shared prices last loaded on this device."
            : priceLibrary.status === "error"
              ? "Couldn't load the shared prices; using the last ones loaded on this device."
              : priceLibrary.error
        }
      />
      {proposalOpen && (
        <ProposalDocument
          content={content}
          estimate={estimate}
          settings={settings}
          onChange={onChange}
          company={priceLibrary.library.company}
          onEditCompany={() => setLibraryOpen({ tab: "company" })}
          projectName={projectName}
          onClose={closeProposal}
        />
      )}
      <PriceLibraryModal
        isOpen={libraryOpen !== null}
        onClose={() => setLibraryOpen(null)}
        initialTab={libraryOpen?.tab ?? "prices"}
        library={priceLibrary.library}
        status={priceLibrary.status}
        error={priceLibrary.error}
        canEdit={priceLibrary.canEdit}
        signedIn={priceLibrary.signedIn}
        onSave={priceLibrary.save}
        inUse={new Set(estimate.lines.flatMap((l) => (l.item ? [l.item.id] : [])))}
      />
    </>
  )
}

export default SiteEstimate
