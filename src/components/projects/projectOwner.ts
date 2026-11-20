/** Opening someone else's private project, as an admin: its link names
 * the owner (`&owner=<uid>`), and the editor loads and saves it there —
 * the database rules let only an admin read or change another account's
 * project. Everyone else's links carry no owner, and a project is looked
 * for among the public ones, then the signed-in person's own. Shared by
 * the retaining wall, site and stair editors. */

import type { ProjectLocation } from "../retainingWall/wallProjectStore"

/** where to look for a project, in order */
export const projectCandidates = (myUid: string | undefined | null, owner: string | null): ProjectLocation[] =>
  owner && owner !== myUid
    ? [{ kind: "private", uid: owner }]
    : [{ kind: "public" }, ...(myUid ? [{ kind: "private" as const, uid: myUid }] : [])]

/** a project link with its owner on it, when it isn't the viewer's own */
export const withOwner = (href: string, owner: string | null | undefined, myUid?: string | null) =>
  owner && owner !== myUid ? `${href}${href.includes("?") ? "&" : "?"}owner=${encodeURIComponent(owner)}` : href

/** the owner of a loaded project, when it's someone else's private one */
export const otherOwner = (location: ProjectLocation | null, myUid: string | undefined | null) =>
  location?.kind === "private" && location.uid !== myUid ? location.uid : null

/** shown in an editor's status line when an admin has someone else's project open */
export const otherOwnerNote = (owner: string) => ` · admin: editing account ${owner.slice(0, 6)}…'s private project`
