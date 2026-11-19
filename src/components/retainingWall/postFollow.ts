/** Hand-set values (levels, hole depths, post sizes…) are keyed by post
 * index, so when the post layout changes they have to follow their
 * posts. A layout here is every run's posts as fractions of the way along
 * it — see segmentPostFractions.
 *
 * Runs whose layout is unchanged, counting in from the start of the wall
 * and in from its end, keep every value (shifted to the post's new
 * number). Where the runs in between changed but there are as many of
 * them as before (posts added or taken out, a post pinned somewhere), each
 * value moves to the new post nearest to where its old one stood along
 * that run. Only when runs were added or taken out in between (a corner
 * added or removed) are the values on those runs let go. */
export function followPosts(before: number[][], after: number[][], prepended = false): (oldIndex: number) => number | null {
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-4)
  let prefix = 0
  if (!prepended) while (prefix < before.length && prefix < after.length && same(before[prefix], after[prefix])) prefix++
  let suffix = 0
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    same(before[before.length - 1 - suffix], after[after.length - 1 - suffix])
  )
    suffix++

  // the index of each run's first post (shared with the run before it)
  const starts = (layout: number[][]) => {
    const out: number[] = []
    let at = 0
    for (const run of layout) {
      out.push(at)
      at += run.length - 1
    }
    out.push(at) // one past: the last post's index
    return out
  }
  const sb = starts(before)
  const sa = starts(after)
  const lastBefore = sb[before.length]
  const lastAfter = sa[after.length]

  // the unchanged runs at the start: up to and including the last post of
  // the last of them (none if a run was added before them)
  const keepUpTo = prefix === 0 ? (prepended ? -1 : 0) : sb[prefix]
  // the unchanged runs at the end, from their first post
  const keepFrom = suffix === 0 ? lastBefore : sb[before.length - suffix]
  const shiftBy = lastAfter - lastBefore
  const middleSame = before.length - prefix - suffix === after.length - prefix - suffix

  return (i: number) => {
    if (i < 0 || i > lastBefore) return null
    if (i <= keepUpTo) return i
    if (i >= keepFrom) return i + shiftBy
    if (!middleSame) return null
    // in a changed run: the nearest post at the same place along it
    let run = prefix
    while (run < before.length - suffix - 1 && i >= sb[run + 1]) run++
    const at = before[run][i - sb[run]]
    const fractions = after[run]
    let best = 0
    fractions.forEach((f, k) => {
      if (Math.abs(f - at) < Math.abs(fractions[best] - at)) best = k
    })
    return sa[run] + best
  }
}

/** Moves every entry of a post-keyed record through `map`, dropping those
 * whose post has gone. Where two land on one post, the first one wins. */
export function followRecord<T>(record: Record<string | number, T>, map: (i: number) => number | null): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [key, value] of Object.entries(record)) {
    const to = map(Number(key))
    if (to !== null && !(String(to) in next)) next[String(to)] = value
  }
  return next
}

/** The same for a record keyed by a bay's left post: the bay follows only
 * if both its posts land side by side again. */
export function followBayRecord<T>(record: Record<string, T>, map: (i: number) => number | null): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [key, value] of Object.entries(record)) {
    const left = map(Number(key))
    const right = map(Number(key) + 1)
    if (left !== null && right === left + 1 && !(String(left) in next)) next[String(left)] = value
  }
  return next
}
